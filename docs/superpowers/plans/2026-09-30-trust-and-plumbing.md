# Benefits City — Trust & Plumbing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Benefits City's data trustworthy and self-checking, make the site + MCP discoverable by agents, and make affiliate links a zero-code-change drop-in with correct disclosure.

**Architecture:** Extend the existing TypeScript/Node app in place (`src/db.ts` JSON store, `src/mcp-tools.ts` shared MCP factory, `src/web-server.ts` HTTP). Add three small focused modules: `src/links.ts` (apply-URL resolution, public shaping, disclosure wording), `src/meta.ts` (version constants), `src/freshness.ts` + `src/freshness-cli.ts` (pure classifier + fetch runner). Seed files become the single source of truth (upsert **and** prune). Tests use Node's built-in `node:test` against compiled `dist/` — no new dependencies.

**Tech Stack:** TypeScript 5.7 (NodeNext ESM), Node 24 locally / ≥20 engines, `@modelcontextprotocol/sdk` ^1.17, `zod`, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-30-trust-and-plumbing-design.md` (Desk ID D-1518, frame card `frame-cards/D-1518.md`).

## Global Constraints

- Working dir for all commands: `~/AI-Workbench/projects/benefits-city`. Python, if ever needed: `/opt/miniconda3/bin/python3`.
- Commit **by path only** (`git add -- <paths>`); never `git add -A` / `.` / `commit -a` (rules/repo-hygiene.md).
- End every commit message with:
  `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Cj6mF8e6XcyosYEvup19ET`
- All new record fields are **optional on input**; the 29 existing records must still validate and serve.
- **Ranking/sort never reads `affiliate_url`, `sponsored`, or any commission value.** Sort key = `bonus_amount_usd` desc, tie-break `id` asc.
- Never scrape a site whose robots.txt disallows us; a bot-block/error page never means "offer dead."
- No web fetch inside a cron via `claude -p`; the freshness job is a deterministic Node script (rules/prose-vs-code.md).
- Raw `affiliate_url` is never published in any feed/MCP/CLI output; consumers get `apply_url` (our `/go/:id` link) + `sponsored`.
- **No production deploy, registry publish, or cron change without explicit principal approval in that step** (rules/prod-hard-gate + consent-boundary). Those steps are marked 🔒.
- Disclosure wording changes require Morgan's review before deploy (Task 9).
- Dates are `YYYY-MM-DD`. "Today" = `new Date().toISOString().slice(0,10)` (UTC), same as the existing code.

## Review Focus

Failure modes the spec implies but no obvious task test would otherwise cover (each is pinned by a test in the owning task):

1. **Expiry boundary:** an offer with `expiry_date == today` is still served (consistent with `expiringSoon`); `== yesterday` is not. (Task 1)
2. **Legacy records:** a record with none of the new fields (old seed shape) loads, validates, serves. (Task 1)
3. **Open-redirect safety:** `affiliate_url`/`application_url` of `javascript:`/`data:`/garbage must never be redirected to; `/go/:id` 404s or falls back to a valid URL. (Task 2)
4. **Bot-block ≠ dead:** a 403/429/"Oops, something went wrong" page yields `blocked`, never `expired`/`gone`. (Task 6)
5. **Stale rows linger:** removing or renaming a record in seed JSON (e.g. Chase id rename) must remove the old id from the served store — upsert alone leaves ghosts. (Task 1)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `package.json` | modify | add `test`, `freshness` scripts; version 0.3.0 |
| `.gitignore` | modify | ignore `data/review-queue.json`, `data/freshness-state.json` |
| `src/types.ts` | modify | record schema v2 |
| `src/db.ts` | modify | normalize defaults, `isServable`, servable filtering, `allRecords`, `removeBonus` |
| `src/seed.ts` | modify | exported `validate`, `syncSeed` (upsert+prune), URL/enum checks, run-as-entry guard |
| `src/stats.ts` | modify | count only servable; `savings_offers` |
| `src/links.ts` | create | `isHttpUrl`, `resolveApplyUrl`, `isSponsored`, `affiliateActive`, `publicBase`, `toPublic`, `disclosureShort` |
| `src/meta.ts` | create | `API_VERSION`, `SERVER_VERSION`, `SKILL_URI`, server.json/auth.md builders |
| `src/mcp-tools.ts` | modify | savings enum, `toPublic` output, typed errors, `benefits_api_docs`/`benefits_examples` tools, skill resource |
| `src/web-server.ts` | modify | `/go` uses `resolveApplyUrl`, version header, `toPublic` on feeds, `/server.json`, `/.well-known/mcp.json`, `/auth.md` |
| `src/site.ts` | modify | savings filter, sponsored rel, conditional disclosure, connect one-liners + prompts, llms.txt |
| `src/cli.ts` | modify | accept `savings`, `toPublic` output |
| `src/freshness.ts` | create | pure classification + hashing (no I/O) |
| `src/freshness-cli.ts` | create | robots-aware fetch runner, review queue writer, canary |
| `skill/benefits-city/SKILL.md` | create | product skill served at `skill://benefits-city/benefits-city/SKILL.md` |
| `src/tests/*.test.ts` | create | one file per task (helpers in `src/tests/helpers.ts`) |
| `seed-data/*.json` | modify | Task 7 data ops |
| `README.md`, `REFRESH_PLAN.md` | modify | document new flow |

---

### Task 1: Data model v2, servable filtering, prune-on-seed, test harness

**Files:**
- Modify: `package.json`, `.gitignore`, `src/types.ts`, `src/db.ts`, `src/seed.ts`, `src/stats.ts`
- Create: `src/tests/helpers.ts`, `src/tests/model.test.ts`

**Interfaces:**
- Produces (used by all later tasks):
  - `types.ts`: `BonusType = "bank_account" | "credit_card" | "savings"`, `BonusStatus`, `OfferHistoryEntry`, `Verification`, `Eligibility`, extended `Bonus`.
  - `db.ts`: `todayISO(): string`, `isServable(b: Bonus, today?: string): boolean`, `allRecords(): Bonus[]`, `removeBonus(id: string): boolean`; existing `searchBonuses/getBonusById/listAll/expiringSoon/upsertBonus/getDb` keep signatures but return servable records only.
  - `seed.ts`: `validate(raw: SeedBonus, file: string, idx: number): Bonus`, `syncSeed(seedDir: string): { upserted: number; removed: string[] }`.
  - `stats.ts`: `Stats.savings_offers: number`.
  - `tests/helpers.ts`: `makeBonus(o?: Partial<Bonus>): Bonus`, `iso(offsetDays: number): string`, `setupDb(records: Bonus[]): Promise<typeof import("../db.js")>`.

- [ ] **Step 1: Add test script + gitignore entries**

`package.json` scripts — add (keep existing):
```json
"test": "tsc && node --test dist/tests/*.test.js",
"freshness": "node dist/freshness-cli.js"
```
Append to `.gitignore`:
```
data/review-queue.json
data/freshness-state.json
```
Run: `node -v` → Expected: v20 or higher.

- [ ] **Step 2: Write `src/tests/helpers.ts`**

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Bonus } from "../types.js";

export function iso(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function makeBonus(o: Partial<Bonus> = {}): Bonus {
  return {
    id: "test-offer",
    bank_or_issuer: "Test Bank",
    product_name: "Test Checking",
    bonus_type: "bank_account",
    bonus_amount_usd: 300,
    bonus_points: null,
    annual_fee_usd: null,
    requirements: ["Open an account"],
    min_deposit_usd: null,
    direct_deposit_required: false,
    expiry_date: iso(30),
    states_available: "nationwide",
    application_url: "https://example.com/apply",
    source_url: "https://example.com/source",
    last_verified_date: iso(0),
    affiliate_url: null,
    offer_history: [],
    verification: null,
    status: "active",
    eligibility: null,
    ...o,
  };
}

/** Write records to a temp JSON store, point BONUS_DB_PATH at it, and import db.js fresh.
 *  Call once per test FILE (each file runs in its own process under `node --test`). */
export async function setupDb(records: Bonus[]): Promise<typeof import("../db.js")> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "benefits-test-"));
  const file = path.join(dir, "bonuses.json");
  fs.writeFileSync(file, JSON.stringify({ bonuses: records }));
  process.env.BONUS_DB_PATH = file;
  return import("../db.js");
}
```

- [ ] **Step 3: Write the failing tests `src/tests/model.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { iso, makeBonus, setupDb } from "./helpers.js";

const legacy = {
  // a record in the OLD seed shape: none of the v2 fields
  id: "legacy-old",
  bank_or_issuer: "Old Bank",
  product_name: "Old Checking",
  bonus_type: "bank_account",
  bonus_amount_usd: 100,
  bonus_points: null,
  annual_fee_usd: null,
  requirements: [],
  min_deposit_usd: null,
  direct_deposit_required: false,
  expiry_date: null,
  states_available: "nationwide",
  application_url: null,
  source_url: null,
  last_verified_date: null,
} as unknown as ReturnType<typeof makeBonus>;

const records = [
  makeBonus({ id: "future", bonus_amount_usd: 500, expiry_date: iso(10) }),
  makeBonus({ id: "expires-today", bonus_amount_usd: 400, expiry_date: iso(0) }),
  makeBonus({ id: "expired-yesterday", bonus_amount_usd: 900, expiry_date: iso(-1) }),
  makeBonus({ id: "status-expired", bonus_amount_usd: 800, expiry_date: iso(20), status: "expired" }),
  makeBonus({ id: "sav", bonus_type: "savings", bonus_amount_usd: 200, expiry_date: iso(40) }),
  legacy,
];

const db = await setupDb(records);

test("expired (by date or status) is never served anywhere; today still served", async () => {
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
  assert.deepEqual(ids(db.listAll()).sort(), ["expires-today", "future", "legacy-old", "sav"]);
  assert.ok(!ids(db.searchBonuses({ limit: 100 })).includes("expired-yesterday"));
  assert.ok(!ids(db.searchBonuses({ limit: 100 })).includes("status-expired"));
  assert.equal(db.getBonusById("expired-yesterday"), undefined);
  assert.equal(db.getBonusById("status-expired"), undefined);
  assert.ok(db.getBonusById("expires-today"));
  assert.ok(!ids(db.expiringSoon(365)).includes("status-expired"));
  const { getStats } = await import("../stats.js");
  const s = getStats();
  assert.equal(s.total_offers, 4);
  assert.equal(s.savings_offers, 1);
});

test("legacy record (no v2 fields) loads with defaults and is served", () => {
  const b = db.getBonusById("legacy-old");
  assert.ok(b);
  assert.equal(b!.affiliate_url, null);
  assert.deepEqual(b!.offer_history, []);
  assert.equal(b!.verification, null);
  assert.equal(b!.status, "active");
  assert.equal(b!.eligibility, null);
});

test("savings is a filterable type; sort is value desc, id asc on ties", () => {
  assert.deepEqual(db.searchBonuses({ bonus_type: "savings" }).map((b) => b.id), ["sav"]);
  const top = db.searchBonuses({ limit: 100 }).map((b) => b.id);
  assert.equal(top[0], "future");
});

test("removeBonus deletes and reports", () => {
  db.upsertBonus(makeBonus({ id: "tmp-remove" }));
  assert.equal(db.removeBonus("tmp-remove"), true);
  assert.equal(db.removeBonus("tmp-remove"), false);
  assert.equal(db.allRecords().some((b) => b.id === "tmp-remove"), false);
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm run test`
Expected: FAIL — TypeScript errors (`savings` not assignable, `affiliate_url` unknown, `isServable`/`removeBonus` missing).

- [ ] **Step 5: Replace `src/types.ts`**

```ts
export type BonusType = "bank_account" | "credit_card" | "savings";
export type BonusStatus = "active" | "expired" | "needs_review";

export interface OfferHistoryEntry {
  amount_usd: number;
  /** "YYYY-MM-DD" or null when unknown */
  valid_from: string | null;
  valid_to: string | null;
}

export interface Verification {
  /** issuer_page = we fetched the issuer's own page; aggregator_consensus = 3+ reputable listings agree */
  method: "issuer_page" | "aggregator_consensus";
  /** "YYYY-MM-DD" */
  verified_at: string;
  sources: string[];
}

/** Structured eligibility facts (nullable = unknown). Consumed by the later planner sub-project. */
export interface Eligibility {
  new_to_bank: boolean | null;
  once_per_lifetime: boolean | null;
  cooldown_months: number | null;
  issuer_rules: string[];
}

/** A single bank account, savings account, or credit card signup bonus offer. */
export interface Bonus {
  /** kebab-case unique id, e.g. "chase-total-checking-300" */
  id: string;
  /** e.g. "Chase" */
  bank_or_issuer: string;
  /** e.g. "Total Checking" */
  product_name: string;
  bonus_type: BonusType;
  /** Advertised bonus in USD. For credit cards: estimated USD value of the points/miles bonus. */
  bonus_amount_usd: number;
  /** Points/miles granted (credit cards), null otherwise */
  bonus_points: number | null;
  /** Annual fee in USD (credit cards), null if none/unknown */
  annual_fee_usd: number | null;
  /** Plain-English qualifying requirements */
  requirements: string[];
  /** Minimum opening deposit in USD, null if none/unknown */
  min_deposit_usd: number | null;
  direct_deposit_required: boolean;
  /** "YYYY-MM-DD" or null when the bank states no end date */
  expiry_date: string | null;
  /** "nationwide" or array of 2-letter US state codes */
  states_available: string | string[];
  /** The issuer's own offer/application page (never an affiliate URL) */
  application_url: string | null;
  /** Partner-tracked URL; used by /go/:id when present. NEVER published in feeds/MCP/CLI. */
  affiliate_url: string | null;
  /** Page where the live terms were confirmed */
  source_url: string | null;
  /** "YYYY-MM-DD" the terms were last confirmed */
  last_verified_date: string | null;
  offer_history: OfferHistoryEntry[];
  verification: Verification | null;
  status: BonusStatus;
  eligibility: Eligibility | null;
}

/** Raw shape accepted from seed JSON files (some fields optional, defaults applied). */
export type SeedBonus = Partial<Bonus> &
  Pick<Bonus, "id" | "bank_or_issuer" | "product_name" | "bonus_type" | "bonus_amount_usd">;
```

- [ ] **Step 6: Replace `src/db.ts`**

```ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Bonus, BonusType } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

export function defaultDbPath(): string {
  return process.env.BONUS_DB_PATH ?? path.join(PROJECT_ROOT, "data", "bonuses.json");
}

interface Store {
  bonuses: Bonus[];
}

let store: Store | null = null;
let storePath = "";

function normalize(raw: Bonus): Bonus {
  return {
    ...raw,
    requirements: Array.isArray(raw.requirements) ? raw.requirements : [],
    states_available: raw.states_available ?? "nationwide",
    direct_deposit_required: raw.direct_deposit_required === true,
    affiliate_url: raw.affiliate_url ?? null,
    offer_history: Array.isArray(raw.offer_history) ? raw.offer_history : [],
    verification: raw.verification ?? null,
    status: raw.status ?? "active",
    eligibility: raw.eligibility ?? null,
  };
}

/** Load (or create) the JSON store. Returned object is the live in-memory store. */
export function getDb(dbPath?: string): Store {
  const resolved = dbPath ?? defaultDbPath();
  if (store && storePath === resolved) return store;
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  if (fs.existsSync(resolved)) {
    const parsed: unknown = JSON.parse(fs.readFileSync(resolved, "utf8"));
    const bonuses = Array.isArray(parsed) ? parsed : (parsed as Store).bonuses ?? [];
    store = { bonuses: (bonuses as Bonus[]).map(normalize) };
  } else {
    store = { bonuses: [] };
    storePath = resolved;
    persist(resolved);
  }
  storePath = resolved;
  return store;
}

function persist(resolved: string): void {
  if (!store) return;
  const tmp = `${resolved}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), "utf8");
  fs.renameSync(tmp, resolved);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** An offer is servable unless marked expired or its stated end date is before today.
 *  An offer expiring TODAY is still servable (matches expiringSoon's `>= today`). */
export function isServable(b: Bonus, today: string = todayISO()): boolean {
  if (b.status === "expired") return false;
  return b.expiry_date == null || b.expiry_date >= today;
}

/** Every stored record including expired — for the freshness job and seed pruning only. */
export function allRecords(): Bonus[] {
  return getDb().bonuses.slice();
}

export function upsertBonus(b: Bonus): void {
  const s = getDb();
  const record = normalize(b);
  const idx = s.bonuses.findIndex((x) => x.id === record.id);
  if (idx >= 0) s.bonuses[idx] = record;
  else s.bonuses.push(record);
  persist(storePath || defaultDbPath());
}

export function removeBonus(id: string): boolean {
  const s = getDb();
  const idx = s.bonuses.findIndex((x) => x.id === id);
  if (idx < 0) return false;
  s.bonuses.splice(idx, 1);
  persist(storePath || defaultDbPath());
  return true;
}

export interface SearchFilters {
  bonus_type?: BonusType;
  /** 2-letter US state code; "nationwide" offers always match */
  state?: string;
  min_bonus_amount_usd?: number;
  direct_deposit_required?: boolean;
  /** substring match on bank/issuer or product name */
  query?: string;
  limit?: number;
}

/** Deterministic, commission-independent ordering: value desc, then id asc. */
const byValue = (a: Bonus, b: Bonus): number =>
  b.bonus_amount_usd - a.bonus_amount_usd || a.id.localeCompare(b.id);

export function searchBonuses(f: SearchFilters = {}): Bonus[] {
  const s = getDb();
  let out = s.bonuses.filter((b) => isServable(b));
  if (f.bonus_type) out = out.filter((b) => b.bonus_type === f.bonus_type);
  if (f.min_bonus_amount_usd != null) out = out.filter((b) => b.bonus_amount_usd >= (f.min_bonus_amount_usd as number));
  if (f.direct_deposit_required != null)
    out = out.filter((b) => b.direct_deposit_required === f.direct_deposit_required);
  if (f.query) {
    const q = f.query.toLowerCase();
    out = out.filter(
      (b) =>
        b.bank_or_issuer.toLowerCase().includes(q) || b.product_name.toLowerCase().includes(q),
    );
  }
  if (f.state) {
    const st = f.state.toUpperCase();
    out = out.filter(
      (b) =>
        b.states_available === "nationwide" ||
        (Array.isArray(b.states_available) &&
          b.states_available.map((x) => x.toUpperCase()).includes(st)),
    );
  }
  out.sort(byValue);
  const limit = Math.min(Math.max(f.limit ?? 25, 1), 100);
  return out.slice(0, limit);
}

export function getBonusById(id: string): Bonus | undefined {
  return getDb().bonuses.find((b) => b.id === id && isServable(b));
}

export function listAll(): Bonus[] {
  return getDb()
    .bonuses.filter((b) => isServable(b))
    .sort((a, b) => a.bonus_type.localeCompare(b.bonus_type) || byValue(a, b));
}

function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Bonuses with a stated expiry date falling within the next `days` days, soonest first. */
export function expiringSoon(days = 30): Bonus[] {
  const today = todayISO();
  const cutoff = addDaysISO(days);
  return getDb()
    .bonuses.filter(
      (b) =>
        isServable(b, today) && b.expiry_date != null && b.expiry_date >= today && b.expiry_date <= cutoff,
    )
    .sort((a, b) => (a.expiry_date as string).localeCompare(b.expiry_date as string));
}
```

- [ ] **Step 7: Update `src/stats.ts`**

Change the import and first lines; add `savings_offers`:
```ts
import { expiringSoon, listAll } from "./db.js";
```
In `interface Stats` add after `credit_card_offers: number;`:
```ts
  savings_offers: number;
```
In `getStats()` replace `const bonuses = getDb().bonuses;` with `const bonuses = listAll();` and add in the returned object after `credit_card_offers: cards.length,`:
```ts
    savings_offers: bonuses.filter((b) => b.bonus_type === "savings").length,
```
(Keep everything else, including `...liveCounters()`.)

- [ ] **Step 8: Replace `src/seed.ts`**

```ts
#!/usr/bin/env node
/**
 * Seed script: seed-data/*.json is the SINGLE SOURCE OF TRUTH. Every record is validated and
 * upserted by id, and any stored id that is no longer in the seed files is REMOVED (so a
 * renamed or deleted offer cannot linger in the served store).
 *
 *   npm run seed
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { allRecords, getDb, removeBonus, upsertBonus } from "./db.js";
import type { Bonus, BonusStatus, BonusType, SeedBonus } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SEED_DIR = path.join(ROOT, "seed-data");

const TYPES: BonusType[] = ["bank_account", "credit_card", "savings"];
const STATUSES: BonusStatus[] = ["active", "expired", "needs_review"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(msg: string): never {
  throw new Error(msg);
}

function httpUrlOrNull(v: unknown, where: string, field: string): string | null {
  if (v == null) return null;
  try {
    const u = new URL(String(v));
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {
    /* fall through */
  }
  return fail(`${where}: "${field}" must be an http(s) URL or null`);
}

export function validate(raw: SeedBonus, file: string, idx: number): Bonus {
  const where = `${file}[${idx}]`;
  if (!raw.id || typeof raw.id !== "string") fail(`${where}: missing string "id"`);
  if (!raw.bank_or_issuer || typeof raw.bank_or_issuer !== "string")
    fail(`${where}: missing string "bank_or_issuer"`);
  if (!raw.product_name || typeof raw.product_name !== "string")
    fail(`${where}: missing string "product_name"`);
  if (!TYPES.includes(raw.bonus_type as BonusType))
    fail(`${where}: "bonus_type" must be one of ${TYPES.join(", ")}`);
  if (typeof raw.bonus_amount_usd !== "number" || Number.isNaN(raw.bonus_amount_usd))
    fail(`${where}: "bonus_amount_usd" must be a number`);
  if (raw.expiry_date != null && !DATE.test(raw.expiry_date))
    fail(`${where}: "expiry_date" must be YYYY-MM-DD or null`);
  if (raw.last_verified_date != null && !DATE.test(raw.last_verified_date))
    fail(`${where}: "last_verified_date" must be YYYY-MM-DD or null`);
  if (raw.status != null && !STATUSES.includes(raw.status))
    fail(`${where}: "status" must be one of ${STATUSES.join(", ")}`);
  if (raw.verification != null) {
    const v = raw.verification;
    if (v.method !== "issuer_page" && v.method !== "aggregator_consensus")
      fail(`${where}: "verification.method" must be issuer_page or aggregator_consensus`);
    if (!DATE.test(String(v.verified_at))) fail(`${where}: "verification.verified_at" must be YYYY-MM-DD`);
    if (!Array.isArray(v.sources)) fail(`${where}: "verification.sources" must be an array`);
  }
  if (raw.offer_history != null && !Array.isArray(raw.offer_history))
    fail(`${where}: "offer_history" must be an array`);

  return {
    id: raw.id,
    bank_or_issuer: raw.bank_or_issuer,
    product_name: raw.product_name,
    bonus_type: raw.bonus_type as BonusType,
    bonus_amount_usd: raw.bonus_amount_usd,
    bonus_points: raw.bonus_points ?? null,
    annual_fee_usd: raw.annual_fee_usd ?? null,
    requirements: Array.isArray(raw.requirements) ? raw.requirements : [],
    min_deposit_usd: raw.min_deposit_usd ?? null,
    direct_deposit_required: raw.direct_deposit_required === true,
    expiry_date: raw.expiry_date ?? null,
    states_available: raw.states_available ?? "nationwide",
    application_url: httpUrlOrNull(raw.application_url, where, "application_url"),
    affiliate_url: httpUrlOrNull(raw.affiliate_url, where, "affiliate_url"),
    source_url: httpUrlOrNull(raw.source_url, where, "source_url"),
    last_verified_date: raw.last_verified_date ?? null,
    offer_history: raw.offer_history ?? [],
    verification: raw.verification ?? null,
    status: raw.status ?? "active",
    eligibility: raw.eligibility ?? null,
  };
}

export function syncSeed(seedDir: string): { upserted: number; removed: string[] } {
  getDb(); // creates DB
  if (!fs.existsSync(seedDir)) fail(`seed-data directory not found: ${seedDir}`);
  const files = fs
    .readdirSync(seedDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (files.length === 0) fail(`no seed JSON files in ${seedDir}`);

  const seen = new Set<string>();
  let upserted = 0;
  for (const file of files) {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(seedDir, file), "utf8"));
    if (!Array.isArray(parsed)) fail(`${file}: expected a top-level JSON array`);
    for (let i = 0; i < parsed.length; i++) {
      const rec = validate(parsed[i] as SeedBonus, file, i);
      upsertBonus(rec);
      seen.add(rec.id);
      upserted++;
    }
    console.log(`seeded ${parsed.length} bonus(es) from ${file}`);
  }
  const removed: string[] = [];
  for (const b of allRecords()) {
    if (!seen.has(b.id)) {
      removeBonus(b.id);
      removed.push(b.id);
    }
  }
  if (removed.length) console.log(`pruned ${removed.length} stale id(s): ${removed.join(", ")}`);
  console.log(`done: ${upserted} bonus(es) in database`);
  return { upserted, removed };
}

// Run only when executed directly (prestart: `node dist/seed.js`), not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncSeed(SEED_DIR);
}
```

- [ ] **Step 9: Add seed tests to `src/tests/model.test.ts`** (append; they run in the same process, using a second temp dir for seed files)

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("syncSeed upserts and PRUNES ids no longer in seed files (rename leaves no ghost)", async () => {
  const { syncSeed, validate } = await import("../seed.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seed-"));
  const rec = (id: string) => ({
    id, bank_or_issuer: "Chase", product_name: "Total Checking", bonus_type: "bank_account",
    bonus_amount_usd: 400, expiry_date: iso(20), application_url: "https://chase.com/x",
  });
  fs.writeFileSync(path.join(dir, "a.json"), JSON.stringify([rec("chase-total-checking-300")]));
  syncSeed(dir);
  assert.ok(db.getBonusById("chase-total-checking-300"));
  // rename: old id disappears from the seed
  fs.writeFileSync(path.join(dir, "a.json"), JSON.stringify([rec("chase-total-checking-400")]));
  const r = syncSeed(dir);
  assert.ok(r.removed.includes("chase-total-checking-300"));
  assert.equal(db.getBonusById("chase-total-checking-300"), undefined);
  assert.ok(db.getBonusById("chase-total-checking-400"));
  // bad input is rejected loudly
  assert.throws(() => validate({ ...rec("x"), application_url: "javascript:alert(1)" } as never, "t", 0), /http\(s\)/);
  assert.throws(() => validate({ ...rec("x"), bonus_type: "crypto" } as never, "t", 0), /bonus_type/);
});
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `npm run test`
Expected: PASS — all tests in `model.test.js` green; `tsc` clean. (If `getStats()` throws because `liveCounters()` needs metrics, it returns zeros when `METRICS_ENABLED`/`METRICS_DB_PATH` unset — confirmed in `src/metrics.ts:346`; if it still fails, stop and report.)

- [ ] **Step 11: Verify the real seed data still loads and nothing is lost**

Run: `BONUS_DB_PATH=/tmp/bc-verify.json node dist/seed.js && node -e "const d=require('/tmp/bc-verify.json');console.log(d.bonuses.length)"`
Expected: `done: 29 bonus(es)`, printed count `29`. Then `rm /tmp/bc-verify.json`.

- [ ] **Step 12: Commit**

```bash
git add -- package.json .gitignore src/types.ts src/db.ts src/seed.ts src/stats.ts src/tests/helpers.ts src/tests/model.test.ts
git commit -m "Benefits City: data model v2, servable filtering, prune-on-seed, test harness (D-1518 T1)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Cj6mF8e6XcyosYEvup19ET"
```

---

### Task 2: Commission-independent link layer + conditional disclosure

**Files:**
- Create: `src/links.ts`, `src/tests/links.test.ts`
- Modify: `src/web-server.ts` (the `/go` block; feed routes), `src/site.ts` (detail button, FAQ line ~266, box ~273, disclosure page ~545–548, llms line ~666)

**Interfaces:**
- Consumes: `Bonus` (Task 1), `listAll`, `searchBonuses`.
- Produces:
  - `links.ts`: `isHttpUrl(v: unknown): v is string`, `resolveApplyUrl(b: Bonus): string | null`, `isSponsored(b: Bonus): boolean`, `affiliateActive(bs: Bonus[]): boolean`, `publicBase(): string`, `PublicBonus` (= `Omit<Bonus,"affiliate_url"> & {sponsored: boolean; apply_url: string|null; disclosure_url: string}`), `toPublic(b: Bonus): PublicBonus`, `disclosureShort(live: boolean): string`.

- [ ] **Step 1: Write failing tests `src/tests/links.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { iso, makeBonus, setupDb } from "./helpers.js";

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";
const base = [
  makeBonus({ id: "a", bonus_amount_usd: 500 }),
  makeBonus({ id: "b", bonus_amount_usd: 400 }),
  makeBonus({ id: "c", bonus_amount_usd: 400 }),
  makeBonus({ id: "d", bonus_amount_usd: 100 }),
];
const db = await setupDb(base);
const links = await import("../links.js");

test("resolveApplyUrl prefers a valid affiliate URL, falls back, and never returns junk schemes", () => {
  const aff = makeBonus({ affiliate_url: "https://partner.example/click?id=1" });
  assert.equal(links.resolveApplyUrl(aff), "https://partner.example/click?id=1");
  const junk = makeBonus({ affiliate_url: "javascript:alert(1)", application_url: "data:text/html,x", source_url: "https://ok.example/s" });
  assert.equal(links.resolveApplyUrl(junk), "https://ok.example/s");
  const none = makeBonus({ affiliate_url: null, application_url: null, source_url: null });
  assert.equal(links.resolveApplyUrl(none), null);
});

test("toPublic hides the raw affiliate URL and exposes our /go link + sponsored flag", () => {
  const p = links.toPublic(makeBonus({ id: "x", affiliate_url: "https://partner.example/click?id=1" }));
  assert.equal("affiliate_url" in p, false);
  assert.equal(p.sponsored, true);
  assert.equal(p.apply_url, "https://aiagentscity.com/benefits/go/x");
  assert.equal(p.disclosure_url, "https://aiagentscity.com/benefits/disclosure");
  const q = links.toPublic(makeBonus({ id: "y" }));
  assert.equal(q.sponsored, false);
  const none = links.toPublic(makeBonus({ id: "z", application_url: null, source_url: null }));
  assert.equal(none.apply_url, null);
});

test("ranking is independent of commission: attaching affiliate URLs never changes order", () => {
  const order = () => db.searchBonuses({ limit: 100 }).map((b) => b.id);
  const before = order();
  assert.deepEqual(before, ["a", "b", "c", "d"]); // ties (b,c) broken by id
  for (const id of ["d", "c"]) {
    const rec = db.getBonusById(id)!;
    db.upsertBonus({ ...rec, affiliate_url: `https://partner.example/${id}` });
  }
  assert.deepEqual(order(), before);
  assert.deepEqual(db.listAll().map((b) => b.id).sort(), ["a", "b", "c", "d"]);
});

test("disclosure wording flips when any affiliate link is live", () => {
  assert.equal(links.affiliateActive([makeBonus()]), false);
  assert.equal(links.affiliateActive([makeBonus({ affiliate_url: "https://p.example/1" })]), true);
  assert.match(links.disclosureShort(false), /earn us nothing/i);
  assert.match(links.disclosureShort(true), /commission/i);
  assert.match(links.disclosureShort(true), /never influence/i);
});

test("detail page marks sponsored links rel=sponsored", async () => {
  const { detailPage } = await import("../site.js");
  const ctx = { basePath: "/benefits", publicUrl: "https://aiagentscity.com/benefits" };
  db.upsertBonus(makeBonus({ id: "spons", affiliate_url: "https://partner.example/s", expiry_date: iso(5) }));
  db.upsertBonus(makeBonus({ id: "plain", expiry_date: iso(5) }));
  assert.match(detailPage(ctx, "spons")!, /rel="sponsored nofollow noopener"/);
  assert.doesNotMatch(detailPage(ctx, "plain")!, /rel="sponsored/);
});
```

- [ ] **Step 2: Run tests, verify fail** — `npm run test` → FAIL (`links.js` missing).

- [ ] **Step 3: Create `src/links.ts`**

```ts
/**
 * Benefits City — apply-link resolution and public shaping.
 *
 * Invariants (enforced by src/tests/links.test.ts):
 *  - only http(s) URLs are ever redirected to;
 *  - the raw affiliate URL is never published — consumers get our /go/:id link;
 *  - nothing here (or anywhere) uses commission in ranking.
 */
import type { Bonus } from "./types.js";

export function isHttpUrl(v: unknown): v is string {
  if (typeof v !== "string" || !v) return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Destination for /go/:id: affiliate URL, else issuer page, else source page (first valid). */
export function resolveApplyUrl(b: Bonus): string | null {
  for (const c of [b.affiliate_url, b.application_url, b.source_url]) if (isHttpUrl(c)) return c;
  return null;
}

export function isSponsored(b: Bonus): boolean {
  return isHttpUrl(b.affiliate_url);
}

export function affiliateActive(bs: Bonus[]): boolean {
  return bs.some(isSponsored);
}

export function publicBase(): string {
  return (process.env.PUBLIC_URL ?? "https://aiagentscity.com/benefits").replace(/\/+$/, "");
}

export type PublicBonus = Omit<Bonus, "affiliate_url"> & {
  sponsored: boolean;
  apply_url: string | null;
  disclosure_url: string;
};

export function toPublic(b: Bonus): PublicBonus {
  const { affiliate_url: _hidden, ...rest } = b;
  return {
    ...rest,
    sponsored: isSponsored(b),
    apply_url: resolveApplyUrl(b) ? `${publicBase()}/go/${b.id}` : null,
    disclosure_url: `${publicBase()}/disclosure`,
  };
}

/** One-sentence disclosure used on the landing box, llms.txt and MCP docs. Wording is Morgan-reviewed. */
export function disclosureShort(live: boolean): string {
  return live
    ? "Some Apply links are affiliate links: we earn a commission if you open an account through them, at no extra cost to you. Commissions never influence which offers we list or how we rank them."
    : "Apply links currently go to issuers' official pages and earn us nothing. If affiliate links are added later they will be marked sponsored, and commissions will never influence which offers we list or how we rank them.";
}
```

- [ ] **Step 4: Edit `src/web-server.ts` `/go` block**

Add import: `import { isHttpUrl, resolveApplyUrl, toPublic } from "./links.js";`
Replace `const dest = offer.application_url || offer.source_url;` with:
```ts
        const dest = resolveApplyUrl(offer);
```
(keep the existing `if (!dest)` and `new URL(dest)` logic). Replace the feed routes:
- `JSON.stringify(listAll(), null, 2)` → `JSON.stringify(listAll().map(toPublic), null, 2)`
- `JSON.stringify(bonus, null, 2)` in the `/api/bonuses/:id` branch → `JSON.stringify(toPublic(bonus), null, 2)`
Remove `isHttpUrl` from the import if unused (keep only what is used; `tsc` will tell you).

- [ ] **Step 5: Edit `src/site.ts`**

1. Imports: `import { affiliateActive, disclosureShort, isSponsored, resolveApplyUrl } from "./links.js";`
2. Detail button (near line 377): replace `const applyUrl = b.application_url || b.source_url;` with `const applyUrl = resolveApplyUrl(b);` and the anchor's `rel="nofollow noopener"` with `rel="${isSponsored(b) ? "sponsored nofollow noopener" : "nofollow noopener"}"`; update the preceding comment's last sentence to: `// Sponsored links carry rel="sponsored".`
3. Disclosure box (~line 273): replace the paragraph's sentence block with `${esc(disclosureShort(affiliateActive(listAll())))}` keeping the `<a href=".../disclosure">Read the full disclosure →</a>` link.
4. FAQ answer (~line 266): replace body with `<p>${esc(disclosureShort(affiliateActive(listAll())))} See the <a href="${bp(ctx, "/disclosure")}">full disclosure</a>.</p>`.
5. Disclosure page (~545–548): inside `disclosurePage`, add `const live = affiliateActive(listAll());` and make the two paragraphs conditional: when `live` is false keep the current text verbatim; when true replace "Today, no link earns us anything…" / "As of today, Apply buttons link to…" with: `Some Apply links on this site are affiliate links and are marked rel="sponsored". If you open an account through one we earn a commission, at no extra cost to you. Affiliate links never affect which offers we list or how we rank them — ranking is by bonus value only.` and list the partner programs by name **after Morgan approves wording (Task 9)** — until then leave a one-line note `Partner programs: see below.` **Do not invent partner names.**
6. `llmsText` (~line 666): replace the line `- Apply links currently point at banks' official offer pages (affiliate partnerships pending).` with `- ${disclosureShort(affiliateActive(listAll()))}`.
Run `npm run typecheck` → Expected: no errors (fix any unused import).

- [ ] **Step 6: Run tests, verify pass** — `npm run test` → PASS (links tests + model tests).

- [ ] **Step 7: Manual verification of `/go` and feeds**

Run (local server on a free port with a throwaway DB copy):
```bash
cp data/bonuses.json /tmp/bc-go.json
PORT=3919 BONUS_DB_PATH=/tmp/bc-go.json node dist/web-server.js & SP=$!
sleep 2
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" localhost:3919/go/chase-total-checking-300
curl -s localhost:3919/api/bonuses.json | grep -c affiliate_url
kill $SP; rm /tmp/bc-go.json
```
Expected: `302 <the chase application_url>`; `0` matches for `affiliate_url`.

- [ ] **Step 8: Commit**

```bash
git add -- src/links.ts src/web-server.ts src/site.ts src/tests/links.test.ts
git commit -m "Benefits City: commission-independent link layer + conditional disclosure (D-1518 T2)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Cj6mF8e6XcyosYEvup19ET"
```

---

### Task 3: Savings category across site, CLI, MCP enums

**Files:**
- Modify: `src/site.ts` (lines ~36, 63, 173, 283, 293, 329–330, 394, 464, 500, 655), `src/cli.ts` (lines ~6, 25, 78–79, outputs), `src/mcp-tools.ts` (enum)
- Test: `src/tests/surface.test.ts`

**Interfaces:**
- Consumes: `BonusType` incl. `"savings"`, `toPublic` (Task 2).
- Produces: browse filter `?type=savings`; CLI `--type savings`; MCP `bonus_type` accepts `savings`.

- [ ] **Step 1: Write failing test `src/tests/surface.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { iso, makeBonus, setupDb } from "./helpers.js";

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";
const db = await setupDb([
  makeBonus({ id: "bank-1", bonus_amount_usd: 300 }),
  makeBonus({ id: "sav-1", bonus_type: "savings", bonus_amount_usd: 200, expiry_date: iso(30) }),
]);

test("browse page can filter to savings and labels the type", async () => {
  const { browsePage, detailPage } = await import("../site.js");
  const ctx = { basePath: "/benefits", publicUrl: "https://aiagentscity.com/benefits" };
  const html = browsePage(ctx, { type: "savings", state: "", min: "", dd: "", q: "", sort: "value" });
  assert.match(html, /sav-1/);
  assert.doesNotMatch(html, /bank-1/);
  assert.match(html, /<option value="savings" selected/);
  assert.match(detailPage(ctx, "sav-1")!, /Savings account bonus/);
});

test("db search honours savings", () => {
  assert.deepEqual(db.searchBonuses({ bonus_type: "savings" }).map((b) => b.id), ["sav-1"]);
});
```
Run `npm run test` → FAIL (browse ignores `savings`).

- [ ] **Step 2: Edit `src/site.ts`**
- Line ~283 comment → `// "" | "bank_account" | "credit_card" | "savings"`.
- Line ~293: replace the `if` with `if (query.type === "bank_account" || query.type === "credit_card" || query.type === "savings")`.
- After the credit-card `<option>` (~330) add: `<option value="savings"${sel("type", "savings", query.type)}>Savings accounts</option>` — (check that `sel()` emits ` selected`; the test asserts `<option value="savings" selected`).
- Line ~394: replace the ternary with a lookup: `${b.bonus_type === "bank_account" ? "Bank account bonus" : b.bonus_type === "savings" ? "Savings account bonus" : "Credit card signup bonus"}`.
- Line ~36 (`b.bonus_type === "bank_account" ? …`): read it; if it picks a label/icon by type, add the savings branch mirroring bank_account wording ("Savings"). Line ~464 docs: `"bank_account" | "credit_card" | "savings"`. Line ~655 llms schema: `bonus_type (bank_account|credit_card|savings)`. Line ~63/173 (est. value for credit cards) unchanged.

- [ ] **Step 3: Edit `src/cli.ts`**
- Header comment + usage text (lines ~6, ~25): `bank_account|credit_card|savings`.
- Validation (lines ~78–79): accept `savings` and message `--type must be bank_account, credit_card or savings`.
- Wrap outputs with `toPublic`: add `import { toPublic } from "./links.js";`; in `search` use `searchBonuses(...).map(toPublic)`; in `get` use `out(toPublic(b), pretty)`; in `expiring` use `expiringSoon(days).map(toPublic)`; for `compare` map `result.bonuses` through `toPublic` (build `{...result, bonuses: result.bonuses.map(toPublic)}`).

- [ ] **Step 4: Edit `src/mcp-tools.ts`** — in `search_bonuses` change `.enum(["bank_account", "credit_card"])` to `.enum(["bank_account", "credit_card", "savings"])` and the `.describe` to `"Restrict to bank account bonuses, credit card signup bonuses, or savings account bonuses."`. (Output shaping comes in Task 4.)

- [ ] **Step 5: Run** `npm run test` → PASS; `npm run typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
git add -- src/site.ts src/cli.ts src/mcp-tools.ts src/tests/surface.test.ts
git commit -m "Benefits City: savings category across site, CLI, MCP (D-1518 T3)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Cj6mF8e6XcyosYEvup19ET"
```

---

### Task 4: MCP hardening — public shaping, typed errors, docs/examples tools, skill resource, version constants

**Files:**
- Create: `src/meta.ts`, `skill/benefits-city/SKILL.md`, `src/tests/mcp.test.ts`
- Modify: `src/mcp-tools.ts`, `src/web-server.ts` (version header), `package.json` (version 0.3.0)

**Interfaces:**
- Consumes: `toPublic` (Task 2), `compareBonuses`.
- Produces:
  - `meta.ts`: `API_VERSION = "2026-09-30"`, `SERVER_VERSION = "0.3.0"`, `SKILL_URI = "skill://benefits-city/benefits-city/SKILL.md"`.
  - MCP tools: `benefits_api_docs` (no args → markdown string), `benefits_examples` (no args → JSON array of `{title, tool, arguments}`).
  - MCP error envelope: tool errors return `isError: true` with text JSON `{ "error": { "type": string, "message": string, "code"?: string, "param"?: string } }`.
  - MCP resource at `SKILL_URI` (`text/markdown`).

- [ ] **Step 1: Create `src/meta.ts`**

```ts
export const API_VERSION = "2026-09-30";
export const SERVER_VERSION = "0.3.0";
export const SKILL_URI = "skill://benefits-city/benefits-city/SKILL.md";
```
Set `"version": "0.3.0"` in `package.json`.

- [ ] **Step 2: Create `skill/benefits-city/SKILL.md`** (frontmatter `name` must equal the directory name `benefits-city`)

```markdown
---
name: benefits-city
description: Find, compare and time-check US bank-account, savings and credit-card signup bonuses; returns issuer-verified offers with expiry dates and a tracked apply link. Use when a user asks which bonus to open, what is expiring, or how offers compare.
---

# Benefits City — how to finish the job

Tools say *what*; this says *how*.

1. **Shortlist.** `search_bonuses` with the user's constraints: `bonus_type` (bank_account | credit_card | savings), `state` (2-letter; nationwide offers always match), `min_bonus_amount_usd`, `direct_deposit_required`. Results are sorted by bonus value, highest first. Sorting never depends on commissions.
2. **Check time.** `expiring_soon` (days). An offer with no stated end date is never listed there. Treat anything inside 14 days as urgent and say so.
3. **Compare.** `compare_bonuses` with 2–4 ids. Name the highest bonus and the earliest expiry.
4. **Confirm before recommending.** `get_bonus` for requirements, minimum deposit, direct-deposit rules and `last_verified_date`. Quote the requirements; do not paraphrase money amounts.
5. **Hand off.** Give the user `apply_url` (our tracked link). If `sponsored` is true, say the link is an affiliate link and that commissions never affect ranking (see `disclosure_url`).

Rules: credit-card `bonus_amount_usd` is an *estimated* USD value of points — say "est."; always show `last_verified_date`; this is information, not financial advice; if an offer is missing, say it is not in the dataset rather than guessing.
```

- [ ] **Step 3: Write failing tests `src/tests/mcp.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { iso, makeBonus, setupDb } from "./helpers.js";

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";
await setupDb([
  makeBonus({ id: "one", bonus_amount_usd: 500, affiliate_url: "https://partner.example/one" }),
  makeBonus({ id: "two", bonus_amount_usd: 400 }),
  makeBonus({ id: "old", bonus_amount_usd: 900, expiry_date: iso(-3) }),
]);
const { createMcpServer } = await import("../mcp-tools.js");

async function connect() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer();
  await server.connect(a);
  const client = new Client({ name: "t", version: "0" });
  await client.connect(b);
  return client;
}
const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0].text);

test("tools list includes docs + examples; outputs are public-shaped and never expose affiliate_url", async () => {
  const c = await connect();
  const names = (await c.listTools()).tools.map((t) => t.name);
  for (const n of ["search_bonuses", "get_bonus", "expiring_soon", "compare_bonuses", "benefits_api_docs", "benefits_examples"])
    assert.ok(names.includes(n), n);
  const res = JSON.parse(text(await c.callTool({ name: "search_bonuses", arguments: {} })));
  assert.deepEqual(res.map((r: { id: string }) => r.id), ["one", "two"]); // expired 'old' absent
  assert.equal(res[0].sponsored, true);
  assert.equal(res[0].apply_url, "https://aiagentscity.com/benefits/go/one");
  assert.ok(!JSON.stringify(res).includes("partner.example"));
});

test("errors use the typed envelope", async () => {
  const c = await connect();
  const r = await c.callTool({ name: "get_bonus", arguments: { id: "nope" } });
  assert.equal((r as { isError?: boolean }).isError, true);
  const e = JSON.parse(text(r)).error;
  assert.equal(e.type, "not_found");
  assert.equal(e.param, "id");
  assert.match(e.message, /nope/);
  const r2 = await c.callTool({ name: "compare_bonuses", arguments: { ids: ["one", "ghost"] } });
  assert.equal(JSON.parse(text(r2)).error.type, "not_found");
});

test("docs/examples tools and the skill resource are served", async () => {
  const c = await connect();
  assert.match(text(await c.callTool({ name: "benefits_api_docs", arguments: {} })), /search_bonuses/);
  const ex = JSON.parse(text(await c.callTool({ name: "benefits_examples", arguments: {} })));
  assert.ok(Array.isArray(ex) && ex.length >= 3 && ex[0].tool);
  const skill = await c.readResource({ uri: "skill://benefits-city/benefits-city/SKILL.md" });
  assert.match((skill.contents[0] as { text: string }).text, /^---\nname: benefits-city/);
});
```
Run `npm run test` → FAIL.

- [ ] **Step 4: Edit `src/mcp-tools.ts`**

Add imports: `import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url"; import { toPublic } from "./links.js"; import { SERVER_VERSION, SKILL_URI } from "./meta.js";`

Add near the top (after `textResult`):
```ts
function errorResult(type: string, message: string, param?: string, code?: string) {
  const error: Record<string, string> = { type, message };
  if (code) error.code = code;
  if (param) error.param = param;
  return { content: [{ type: "text" as const, text: JSON.stringify({ error }, null, 2) }], isError: true };
}

const SKILL_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "skill", "benefits-city", "SKILL.md");

const API_DOCS = `# Benefits City MCP
Tools: search_bonuses(bonus_type?, state?, min_bonus_amount_usd?, direct_deposit_required?, query?, limit?),
get_bonus(id), expiring_soon(days?), compare_bonuses(ids[2..4]), benefits_api_docs(), benefits_examples().
Every offer: id, bank_or_issuer, product_name, bonus_type (bank_account|credit_card|savings), bonus_amount_usd
(cards: estimated USD value of points), expiry_date, requirements[], verification{method,verified_at,sources},
last_verified_date, sponsored (bool), apply_url (tracked link), disclosure_url.
Ordering: bonus value desc, id asc — never influenced by commissions. Expired offers are never returned.
Errors: {"error":{"type","message","code?","param?"}} with isError=true.`;

const EXAMPLES = [
  { title: "Top checking bonuses without direct deposit", tool: "search_bonuses", arguments: { bonus_type: "bank_account", direct_deposit_required: false, limit: 5 } },
  { title: "What expires in the next two weeks", tool: "expiring_soon", arguments: { days: 14 } },
  { title: "Best savings bonuses in Texas", tool: "search_bonuses", arguments: { bonus_type: "savings", state: "TX" } },
  { title: "Head-to-head", tool: "compare_bonuses", arguments: { ids: ["chase-total-checking-300", "sofi-checking-savings-400"] } },
];
```
In `timed()`'s param whitelist nothing changes. Change `createMcpServer()`:
- `new McpServer({ name: "benefits-city", version: SERVER_VERSION })`
- `search_bonuses` handler → `textResult(searchBonuses(args).map(toPublic))`
- `get_bonus`: on missing → `return errorResult("not_found", \`Unknown bonus id: ${id}\`, "id");` else `textResult(toPublic(bonus))`
- `expiring_soon` → `textResult(expiringSoon(days).map(toPublic))`
- `compare_bonuses`: in `try` → `const r = compareBonuses(ids); return textResult({ ...r, bonuses: r.bonuses.map(toPublic) });` and `catch` → `return errorResult("not_found", (err as Error).message, "ids");`
- Before `return server;` add:
```ts
  server.tool("benefits_api_docs", "Self-serve documentation for this server: tools, record fields, ordering guarantees, error format.", {},
    timed("benefits_api_docs", async () => ({ content: [{ type: "text" as const, text: API_DOCS }] })));
  server.tool("benefits_examples", "Runnable example tool calls (title, tool, arguments) an agent can copy.", {},
    timed("benefits_examples", async () => textResult(EXAMPLES)));
  server.resource("benefits-skill", SKILL_URI, { mimeType: "text/markdown", description: "How to finish the job with Benefits City" },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: fs.readFileSync(SKILL_FILE, "utf8") }] }));
```
(`timed` passes args as `{}` for zero-arg tools; if `tsc` complains about the handler signature, type the handler param as `_args: Record<string, never>`.)

- [ ] **Step 5: Edit `src/web-server.ts`** — version header on every response.
Import `import { API_VERSION } from "./meta.js";`. In `send()` headers add `"x-api-version": API_VERSION,`. In the `/go` `writeHead` add the same header; in the `/mcp` 405 `writeHead` add it too. Also replace the two literal `version: "0.2.0"` (in `/api` descriptor) with `SERVER_VERSION` (import it) and add `"benefits_api_docs", "benefits_examples"` to the descriptor's `tools` array.

- [ ] **Step 6: Run** `npm run test` → PASS. Then manual: `PORT=3920 node dist/web-server.js & sleep 2; curl -sI localhost:3920/healthz | grep -i x-api-version; kill %1` → Expected `x-api-version: 2026-09-30`.

- [ ] **Step 7: Commit**

```bash
git add -- package.json src/meta.ts src/mcp-tools.ts src/web-server.ts skill/benefits-city/SKILL.md src/tests/mcp.test.ts
git commit -m "Benefits City: MCP hardening — typed errors, docs/examples tools, skill resource, version header (D-1518 T4)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Cj6mF8e6XcyosYEvup19ET"
```

---

### Task 5: Discovery endpoints — `server.json`, `/.well-known/mcp.json`, `/auth.md`, skill registry row

**Files:**
- Modify: `src/meta.ts`, `src/web-server.ts`
- Test: `src/tests/http.test.ts`
- External (Workbench): `~/AI-Workbench/projects/product-skill-surface/registry.json`

**Interfaces:**
- Consumes: `publicBase()` (Task 2), `API_VERSION`, `SERVER_VERSION`.
- Produces: `meta.ts` → `serverJson(publicUrl: string): object`, `authMd(publicUrl: string): string`; routes `GET /server.json`, `GET /.well-known/mcp.json` (same JSON), `GET /auth.md` (`text/markdown`).

- [ ] **Step 1: Write failing HTTP test `src/tests/http.test.ts`** (spawns the built server; metrics stay off because no metrics env is set)

```ts
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { iso, makeBonus } from "./helpers.js";

const PORT = 38000 + Math.floor(Math.random() * 1000);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "benefits-http-"));
const dbFile = path.join(dir, "bonuses.json");
fs.writeFileSync(dbFile, JSON.stringify({ bonuses: [
  makeBonus({ id: "live-aff", bonus_amount_usd: 500, affiliate_url: "https://partner.example/click?x=1" }),
  makeBonus({ id: "live-plain", bonus_amount_usd: 400 }),
  makeBonus({ id: "dead", bonus_amount_usd: 900, expiry_date: iso(-2) }),
  makeBonus({ id: "evil", bonus_amount_usd: 100, affiliate_url: "javascript:alert(1)", application_url: null, source_url: null }),
] }));
let child: ChildProcess;
const url = (p: string) => `http://localhost:${PORT}${p}`;

before(async () => {
  child = spawn(process.execPath, ["dist/web-server.js"], {
    env: { ...process.env, PORT: String(PORT), BONUS_DB_PATH: dbFile, PUBLIC_URL: `http://localhost:${PORT}` },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(url("/healthz"))).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
});
after(() => child?.kill());

test("/go redirects to the affiliate URL, 404s on expired and on junk-scheme links", async () => {
  const r = await fetch(url("/go/live-aff"), { redirect: "manual" });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "https://partner.example/click?x=1");
  assert.equal((await fetch(url("/go/dead"), { redirect: "manual" })).status, 404);
  assert.equal((await fetch(url("/go/evil"), { redirect: "manual" })).status, 404);
});

test("feeds never expose affiliate_url or expired offers; version header present", async () => {
  const r = await fetch(url("/api/bonuses.json"));
  assert.equal(r.headers.get("x-api-version"), "2026-09-30");
  const body = await r.text();
  assert.ok(!body.includes("partner.example"));
  assert.ok(!body.includes('"id": "dead"'));
  assert.ok(body.includes('"id": "live-aff"'));
  assert.equal((await fetch(url("/api/bonuses/dead"))).status, 404);
});

test("discovery endpoints return 200 and point at the MCP endpoint", async () => {
  for (const p of ["/server.json", "/.well-known/mcp.json"]) {
    const r = await fetch(url(p));
    assert.equal(r.status, 200, p);
    const j = await r.json();
    assert.equal(j.name, "io.github.entradox/benefits-city");
    assert.equal(j.remotes[0].type, "streamable-http");
    assert.equal(j.remotes[0].url, `http://localhost:${PORT}/mcp`);
  }
  const a = await fetch(url("/auth.md"));
  assert.equal(a.status, 200);
  assert.match(await a.text(), /no credential/i);
});

test("stats and healthz count only servable offers", async () => {
  assert.equal((await (await fetch(url("/healthz"))).json()).offers, 3);
  assert.equal((await (await fetch(url("/api/stats"))).json()).total_offers, 3);
});
```
Run `npm run test` → FAIL (discovery routes 404).

- [ ] **Step 2: Add builders to `src/meta.ts`**

```ts
export function serverJson(publicUrl: string): object {
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    name: "io.github.entradox/benefits-city",
    title: "Benefits City",
    description:
      "US bank-account, savings and credit-card signup bonuses, issuer-verified with expiry dates. Search, compare and time-check offers.",
    repository: { url: "https://github.com/entradox/agent-ledger-benefits-city", source: "github" },
    websiteUrl: publicUrl,
    version: SERVER_VERSION,
    packages: [],
    remotes: [{ type: "streamable-http", url: `${publicUrl}/mcp` }],
  };
}

export function authMd(publicUrl: string): string {
  return `# Benefits City — authentication for agents

**No credential is required.** The MCP endpoint and JSON feeds are open, read-only and rate-limited by the host.

- Flow: anonymous. Connect to \`${publicUrl}/mcp\` (Streamable HTTP) with no Authorization header.
- No registration, API key, or OAuth. Nothing you send is stored as an identity; usage is counted as anonymous aggregates.
- Write operations: none. The server cannot change data on your behalf.
- Discovery: \`${publicUrl}/server.json\`, \`${publicUrl}/llms.txt\`, \`${publicUrl}/agents\`.
- Apply links: use the \`apply_url\` field (our tracked link). When \`sponsored\` is true it is an affiliate link — see \`${publicUrl}/disclosure\`. Ranking never depends on commissions.
`;
}
```
(`meta.ts` is public-URL-free at import time; callers pass the URL.)

- [ ] **Step 3: Add routes in `src/web-server.ts`** after the `/robots.txt` / `/sitemap.xml` handlers, using the request-derived public URL:
```ts
      if (pathname === "/server.json" || pathname === "/.well-known/mcp.json")
        return send(res, 200, "application/json; charset=utf-8", JSON.stringify(serverJson(ctx.publicUrl), null, 2));
      if (pathname === "/auth.md")
        return send(res, 200, "text/markdown; charset=utf-8", authMd(ctx.publicUrl));
```
Import `serverJson, authMd` (and `SERVER_VERSION` if not yet) from `./meta.js`. **BASE_PATH note:** these route under `/benefits/…` automatically because the mount prefix is stripped earlier.
Also add `"/server.json"` and `"/auth.md"` to the sitemap URL list? No — they are machine files; leave the sitemap alone. Add both URLs to the `/api` descriptor `endpoints` and to `llmsText` under "Machine access".

- [ ] **Step 4: Run** `npm run test` → PASS (all four HTTP tests + earlier).

- [ ] **Step 5: Register the skill row** in `~/AI-Workbench/projects/product-skill-surface/registry.json`: read the file, copy the shape of the `agent-ledger` row exactly, and add a `benefits-city` row with `product: "benefits-city"`, `title: "Benefits City"`, `tagline: "Verified bank & card signup bonuses for humans and agents"`, three `example_prompts` (from Task 8), `skill_root: "~/AI-Workbench/projects/benefits-city/skill/benefits-city"`, `uri_product: "benefits-city"`, `mcp_url: "https://aiagentscity.com/benefits/mcp"`, `status: "pending-deploy"`, `serves_skills_live: false`. Run:
`/opt/miniconda3/bin/python3 ~/AI-Workbench/scripts/check-product-skills.py benefits-city`
Expected: exit 0. **If the checker insists the skill live under `product-skill-surface/skills/`** (check rules/product-skill-surface.md and the script's loader), do NOT create a second real copy (Rule Zero): instead make `skill/benefits-city` the master, and adjust `skill_root` to the path the checker accepts via a symlink **from** the Workbench path **to** the repo file; report the choice. Commit the registry row in the Workbench repo by path.

- [ ] **Step 6: Commit (product repo)**

```bash
git add -- src/meta.ts src/web-server.ts src/tests/http.test.ts
git commit -m "Benefits City: server.json, .well-known/mcp.json, auth.md discovery endpoints (D-1518 T5)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Cj6mF8e6XcyosYEvup19ET"
```

- [ ] **Step 7: 🔒 MCP registry publish — principal approval required.** Do NOT run until Task 10 deploy is verified live and the principal says "publish". Then: confirm `mcp-publisher` auth is cached (`mcp-publisher --help` / per skill `agent-native-launch-kit`), run `mcp-publisher publish` from the repo root with `server.json`, and verify with `curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=benefits-city"`. Record the result in the Task 10 close note.

---

### Task 6: Freshness pipeline — pure classifier, robots-aware runner, review queue, canary

**Files:**
- Create: `src/freshness.ts`, `src/freshness-cli.ts`, `src/tests/freshness.test.ts`
- Modify: `REFRESH_PLAN.md`

**Interfaces:**
- Consumes: `Bonus`, `allRecords`, `todayISO`, `isServable`.
- Produces:
  - `freshness.ts`:
    - `type FetchResult = { status: number | null; text: string; error?: string; robotsBlocked?: boolean }`
    - `type FindingKind = "ok" | "expired" | "amount_missing" | "changed" | "blocked" | "unreachable" | "gone"`
    - `interface Finding { id: string; kind: FindingKind; detail: string }`
    - `hashText(html: string): string` (sha256 hex of tag-stripped, whitespace-collapsed, lowercased text)
    - `amountNeedles(b: Bonus): string[]`
    - `classify(b: Bonus, fetched: FetchResult | null, priorHash: string | null, today?: string): { finding: Finding; hash: string | null }`
  - `freshness-cli.ts`: `node dist/freshness-cli.js [--canary]` — exit `0` no actionable findings, `1` findings written to `data/review-queue.json`, `3` broken/no data (zero records loaded or fatal error). `--canary` exits `0` only if the known-good and known-bad fixtures land on opposite sides, else `1`.
- Design notes: the job **never mutates records** — it only writes `data/review-queue.json` (`{generated_at, findings[]}` with non-ok findings) and `data/freshness-state.json` (`{[id]: hash}`). Humans/agents act on the queue (Task 7 procedure).

- [ ] **Step 1: Write failing tests `src/tests/freshness.test.ts`**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { iso, makeBonus } from "./helpers.js";
import { amountNeedles, classify, hashText } from "../freshness.js";

const bank = makeBonus({ id: "b", bonus_amount_usd: 300, expiry_date: iso(10) });
const page = (t: string) => ({ status: 200, text: `<html><body><script>x()</script><p>${t}</p></body></html>` });

test("good page with the stated amount is ok", () => {
  assert.equal(classify(bank, page("Earn a $300 bonus when you open an account"), null).finding.kind, "ok");
});

test("changed-amount fixture is flagged (record says $300, page says $400)", () => {
  const f = classify(bank, page("Earn a $400 bonus when you open an account"), null).finding;
  assert.equal(f.kind, "amount_missing");
  assert.match(f.detail, /\$300/);
});

test("content change vs prior hash is flagged; same hash is ok", () => {
  const first = classify(bank, page("Earn a $300 bonus"), null);
  assert.equal(classify(bank, page("Earn a $300 bonus"), first.hash).finding.kind, "ok");
  assert.equal(classify(bank, page("Earn a $300 bonus — new terms apply"), first.hash).finding.kind, "changed");
});

test("date-expired record is expired without needing a fetch", () => {
  const dead = makeBonus({ id: "d", expiry_date: iso(-1) });
  assert.equal(classify(dead, null, null).finding.kind, "expired");
});

test("BOT-BLOCK IS NOT DEAD: 403/429/'oops' pages are blocked, never expired/gone", () => {
  for (const r of [
    { status: 403, text: "Access Denied" },
    { status: 429, text: "" },
    { status: 200, text: "<p>Oops, something went wrong</p>" },
    { status: 200, text: "<p>Please verify you are human (captcha)</p>" },
    { status: 200, text: "x", robotsBlocked: true },
  ]) assert.equal(classify(bank, r, null).finding.kind, "blocked", JSON.stringify(r));
});

test("404/410 is gone; null/error is unreachable", () => {
  assert.equal(classify(bank, { status: 404, text: "" }, null).finding.kind, "gone");
  assert.equal(classify(bank, { status: 410, text: "" }, null).finding.kind, "gone");
  assert.equal(classify(bank, null, null).finding.kind, "unreachable");
  assert.equal(classify(bank, { status: null, text: "", error: "ECONNRESET" }, null).finding.kind, "unreachable");
});

test("credit cards are checked on points, not the estimated USD value", () => {
  const card = makeBonus({ id: "c", bonus_type: "credit_card", bonus_amount_usd: 1500, bonus_points: 75000 });
  assert.ok(amountNeedles(card).includes("75,000"));
  assert.ok(!amountNeedles(card).includes("$1,500"));
  assert.equal(classify(card, page("Earn 75,000 points"), null).finding.kind, "ok");
  assert.equal(classify(card, page("Earn 60,000 points"), null).finding.kind, "amount_missing");
});

test("hashText ignores markup and whitespace noise", () => {
  assert.equal(hashText("<p>Hello   World</p>"), hashText("<div>hello world</div>"));
  assert.notEqual(hashText("a"), hashText("b"));
});
```
Run `npm run test` → FAIL (`freshness.js` missing).

- [ ] **Step 2: Create `src/freshness.ts`**

```ts
/**
 * Benefits City — freshness classification (PURE: no I/O, no clock unless passed).
 *
 * Doctrine:
 *  - no data is never a pass and never a fail: null/unreachable are their own kind;
 *  - a bot-block or error page is NOT evidence an offer is dead (see REFRESH_PLAN.md);
 *  - the job never edits records; it only reports.
 */
import { createHash } from "node:crypto";
import { isServable, todayISO } from "./db.js";
import type { Bonus } from "./types.js";

export interface FetchResult {
  status: number | null;
  text: string;
  error?: string;
  robotsBlocked?: boolean;
}
export type FindingKind = "ok" | "expired" | "amount_missing" | "changed" | "blocked" | "unreachable" | "gone";
export interface Finding {
  id: string;
  kind: FindingKind;
  detail: string;
}

const BLOCK_PATTERNS = /access denied|captcha|verify you are human|are you a robot|oops,? something went wrong|request blocked|unusual traffic/i;

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function hashText(html: string): string {
  return createHash("sha256").update(visibleText(html)).digest("hex");
}

/** Strings we expect on the issuer page. Cards: points (the USD figure is OUR estimate). */
export function amountNeedles(b: Bonus): string[] {
  if (b.bonus_type === "credit_card") {
    if (!b.bonus_points) return [];
    const n = b.bonus_points;
    const out = [n.toLocaleString("en-US")];
    if (n % 1000 === 0) out.push(`${n / 1000}k`, `${n / 1000},000`);
    return out;
  }
  const n = b.bonus_amount_usd;
  return [`$${n.toLocaleString("en-US")}`, `$${n}`];
}

export function classify(
  b: Bonus,
  fetched: FetchResult | null,
  priorHash: string | null,
  today: string = todayISO(),
): { finding: Finding; hash: string | null } {
  const f = (kind: FindingKind, detail: string) => ({ finding: { id: b.id, kind, detail }, hash: null as string | null });

  if (!isServable(b, today)) return f("expired", `expiry_date ${b.expiry_date ?? "n/a"} / status ${b.status}`);
  if (!fetched || fetched.status == null) return f("unreachable", fetched?.error ?? "no response");
  if (fetched.robotsBlocked) return f("blocked", "robots.txt disallows automated fetch");
  if (fetched.status === 404 || fetched.status === 410) return f("gone", `HTTP ${fetched.status} — a human must confirm before removal`);
  if ([401, 403, 429, 503].includes(fetched.status) || BLOCK_PATTERNS.test(fetched.text))
    return f("blocked", `HTTP ${fetched.status} / bot-block page — NOT evidence the offer is dead`);

  const text = visibleText(fetched.text);
  const needles = amountNeedles(b);
  if (needles.length && !needles.some((n) => text.includes(n.toLowerCase())))
    return f("amount_missing", `page does not mention ${needles[0]} — amount may have changed`);

  const hash = hashText(fetched.text);
  if (priorHash && priorHash !== hash) return { finding: { id: b.id, kind: "changed", detail: "page content changed since last run" }, hash };
  return { finding: { id: b.id, kind: "ok", detail: "amount present" }, hash };
}
```

- [ ] **Step 3: Run tests** → `npm run test` → PASS (freshness tests green).

- [ ] **Step 4: Create `src/freshness-cli.ts`**

```ts
#!/usr/bin/env node
/**
 * Daily freshness check. Reads the served store, fetches each record's source page politely
 * (robots.txt respected, 2s spacing, identifiable UA), classifies, and writes a REVIEW QUEUE.
 * It never edits records.
 *
 * Exit: 0 nothing actionable · 1 findings (see data/review-queue.json) · 3 broken (no data / crash)
 *   --canary : prove the classifier separates known-good from known-bad (exit 0 only if it does)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allRecords } from "./db.js";
import { classify, type FetchResult, type Finding } from "./freshness.js";
import { makeCanaryFixtures } from "./freshness-canary.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUEUE = path.join(ROOT, "data", "review-queue.json");
const STATE = path.join(ROOT, "data", "freshness-state.json");
const UA = "BenefitsCityBot/0.3 (+https://aiagentscity.com/benefits/about)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const robotsCache = new Map<string, string[]>();
async function disallowed(u: URL): Promise<string[]> {
  if (robotsCache.has(u.origin)) return robotsCache.get(u.origin)!;
  const rules: string[] = [];
  try {
    const r = await fetch(`${u.origin}/robots.txt`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(10_000) });
    if (r.ok) {
      let applies = false;
      for (const line of (await r.text()).split(/\r?\n/)) {
        const [k, ...rest] = line.split("#")[0].split(":");
        const key = k.trim().toLowerCase();
        const val = rest.join(":").trim();
        if (key === "user-agent") applies = val === "*" || UA.toLowerCase().includes(val.toLowerCase());
        else if (applies && key === "disallow" && val) rules.push(val);
      }
    }
  } catch {
    /* unreadable robots.txt: proceed (polite fetch, no bypass) */
  }
  robotsCache.set(u.origin, rules);
  return rules;
}

async function fetchPage(url: string): Promise<FetchResult> {
  let u: URL;
  try { u = new URL(url); } catch { return { status: null, text: "", error: "invalid url" }; }
  if ((await disallowed(u)).some((p) => u.pathname.startsWith(p))) return { status: 200, text: "", robotsBlocked: true };
  try {
    const r = await fetch(u, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
    return { status: r.status, text: await r.text() };
  } catch (e) {
    return { status: null, text: "", error: (e as Error).message };
  }
}

function runCanary(): number {
  const { good, bad } = makeCanaryFixtures();
  const g = classify(good.record, good.fetched, null).finding.kind;
  const badKinds = bad.map((x) => classify(x.record, x.fetched, null).finding.kind);
  const ok = g === "ok" && badKinds.every((k) => k !== "ok");
  console.log(`CANARY ${ok ? "PASS" : "FAIL"} — good=${g} bad=[${badKinds.join(",")}]`);
  return ok ? 0 : 1;
}

async function main(): Promise<number> {
  if (process.argv.includes("--canary")) return runCanary();
  const records = allRecords();
  if (records.length === 0) { console.error("FRESHNESS BROKEN: zero records loaded (no data is not a pass)"); return 3; }
  const prior: Record<string, string> = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {};
  const next: Record<string, string> = { ...prior };
  const findings: Finding[] = [];
  for (const b of records) {
    const dest = b.source_url ?? b.application_url;
    const fetched = dest && b.status !== "expired" ? await fetchPage(dest) : null;
    const { finding, hash } = classify(b, fetched, prior[b.id] ?? null);
    if (hash) next[b.id] = hash;
    if (finding.kind !== "ok") findings.push(finding);
    if (dest) await sleep(2000);
  }
  fs.mkdirSync(path.dirname(QUEUE), { recursive: true });
  fs.writeFileSync(QUEUE, JSON.stringify({ generated_at: new Date().toISOString(), checked: records.length, findings }, null, 2));
  fs.writeFileSync(STATE, JSON.stringify(next, null, 2));
  for (const f of findings) console.log(`${f.kind.toUpperCase().padEnd(14)} ${f.id} — ${f.detail}`);
  console.log(`checked ${records.length}, actionable ${findings.length} → ${QUEUE}`);
  return findings.length ? 1 : 0;
}

main().then((c) => process.exit(c), (e) => { console.error("FRESHNESS BROKEN:", e); process.exit(3); });
```
Create `src/freshness-canary.ts` (kept separate so production code does not import test helpers):
```ts
import type { FetchResult } from "./freshness.js";
import type { Bonus } from "./types.js";

function rec(id: string, amount: number): Bonus {
  return {
    id, bank_or_issuer: "Canary Bank", product_name: "Canary", bonus_type: "bank_account", bonus_amount_usd: amount,
    bonus_points: null, annual_fee_usd: null, requirements: [], min_deposit_usd: null, direct_deposit_required: false,
    expiry_date: "2999-12-31", states_available: "nationwide", application_url: null, source_url: "https://example.invalid",
    last_verified_date: null, affiliate_url: null, offer_history: [], verification: null, status: "active", eligibility: null,
  };
}
const page = (t: string): FetchResult => ({ status: 200, text: `<p>${t}</p>` });

/** Known-good and known-bad inputs. The canary asserts they land on opposite sides. */
export function makeCanaryFixtures() {
  return {
    good: { record: rec("canary-good", 300), fetched: page("Earn $300 when you open an account") },
    bad: [
      { record: rec("canary-amount", 300), fetched: page("Earn $400 when you open an account") },
      { record: rec("canary-gone", 300), fetched: { status: 404, text: "" } as FetchResult },
      { record: rec("canary-blocked", 300), fetched: { status: 403, text: "Access Denied" } as FetchResult },
      { record: rec("canary-null", 300), fetched: null },
    ],
  };
}
```

- [ ] **Step 5: Add a canary test** to `src/tests/freshness.test.ts`:
```ts
import { makeCanaryFixtures } from "../freshness-canary.js";
test("canary: known-good ok, every known-bad is non-ok", () => {
  const { good, bad } = makeCanaryFixtures();
  assert.equal(classify(good.record, good.fetched, null).finding.kind, "ok");
  for (const b of bad) assert.notEqual(classify(b.record, b.fetched, null).finding.kind, "ok", b.record.id);
});
```

- [ ] **Step 6: Verify** — `npm run test` → PASS. `npm run build && node dist/freshness-cli.js --canary` → Expected `CANARY PASS — good=ok bad=[amount_missing,gone,blocked,unreachable]`, exit 0. Sabotage proof: temporarily make `classify` return `ok` for 404 (edit `freshness.ts`, rebuild) → canary must print `CANARY FAIL` and exit 1; then **revert** the edit (`git checkout -- src/freshness.ts`) and re-run canary → PASS.

- [ ] **Step 7: Dry run on real data (read-only, polite)** — `BONUS_DB_PATH=$(pwd)/data/bonuses.json node dist/seed.js && node dist/freshness-cli.js; echo "exit=$?"`
Expected: a list of findings (several `blocked` is normal — Wells Fargo/Chase/Fifth Third block bots), exit 0 or 1, never 3. Read `data/review-queue.json`. Do not act on `blocked` as if dead.

- [ ] **Step 8: Update `REFRESH_PLAN.md`** — replace the "No automated refresh"/"Automation sketch (future)" prose with a short "Automated freshness (D-1518)" section: what the job does, exit codes, the queue file, "review queue → Task 7 procedure", and "blocked ≠ dead". Keep the existing compliance notes.

- [ ] **Step 9: Commit**

```bash
git add -- src/freshness.ts src/freshness-canary.ts src/freshness-cli.ts src/tests/freshness.test.ts REFRESH_PLAN.md
git commit -m "Benefits City: daily freshness pipeline — classifier, robots-aware runner, review queue, canary (D-1518 T6)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Cj6mF8e6XcyosYEvup19ET"
```

- [ ] **Step 10: 🔒 Wire the job into Hermes — principal approval required (cron change).** After approval: (a) check the target is not a symlink (`test -L ~/.hermes/scripts/benefits-freshness.sh && echo SYMLINK`); (b) create the master `~/AI-Workbench/scripts/benefits-freshness.sh`:
```bash
#!/bin/bash
# Benefits City freshness check (D-1518). Deterministic; no LLM. Exit 0 clean / 1 findings / 3 broken.
cd ~/AI-Workbench/projects/benefits-city || exit 3
/usr/bin/env node dist/seed.js >/dev/null && node dist/freshness-cli.js
```
`chmod +x`, then `ln -s ~/AI-Workbench/scripts/benefits-freshness.sh ~/.hermes/scripts/benefits-freshness.sh`; (c) register a `no_agent=true` cron (daily, 06:15 ET, before the 06:30 digest) per skill `cron-fleet-ops`, `failure_deliver` = fleet lane (see rules/cron-failure-lanes.md — do not leave it silent). Exit code `1` must be delivered (it is the actionable case), `3` must alert as broken. Verify with one manual fire and read the delivered message. **Extend the existing daily brief rather than duplicating it:** add one line to that brief's prompt/source: "read `data/review-queue.json`".

---

### Task 7: Data ops — re-verify and apply the 2026-09-30 brief actions (research task, source-verified)

**Files:**
- Modify: `seed-data/bank-account-bonuses.json`, `seed-data/credit-card-bonuses.json`
- Create: `seed-data/savings-bonuses.json`

**Interfaces:** consumes `syncSeed` prune semantics (Task 1), freshness queue (Task 6). Produces the corrected served dataset.

**Rule for every change in this task:** a record changes only after the **issuer page** (preferred) or **3+ reputable aggregators agreeing and crawled within days** (per `REFRESH_PLAN.md`) confirm it. Record `verification: {method, verified_at: "2026-09-30", sources:[…]}`, bump `last_verified_date`. Values below are **claims from the brief, not facts** — verify each; if a claim does not verify, leave the record as is and say so.

- [ ] **Step 1: Run the freshness job** (Task 6 Step 7) to get a fresh queue; note which records are `expired`/`amount_missing`/`blocked`.

- [ ] **Step 2: Expiring-today removals** — for each of Fifth Third Momentum $300, Bank of America Advantage Plus $500, Huntington Perks $400, Amex Marriott Bonvoy Brilliant 150k+$250 credit: check the issuer/aggregators for a renewal (brief says "no renewal announced" as of 2026-09-30). If expiry is 2026-09-30 and no renewal is confirmed, **leave the record** — it drops automatically when `expiry_date < today` (no edit needed, the system serves `>= today`). If a renewed/replacement offer is confirmed, update `expiry_date`/amount with sources. (Amex Brilliant: re-add without the $250 credit only if a replacement offer is confirmed.)

- [ ] **Step 3: Wells Fargo swap (deadline-driven: brief says open by 2026-10-06)** — confirm the public $500 offer ($1,000 qualifying electronic deposits within 90 days) via Doctor of Credit + Frequent Miler + the WF page (try `curl` first; if bot-blocked use consensus). Then: in the seed file replace the `wells-fargo-everyday-checking-400` record with `wells-fargo-everyday-checking-500` (amount 500, requirements rewritten from the verified terms, `expiry_date` the verified end, `offer_history: [{amount_usd: 400, valid_from: null, valid_to: "<verified>"}]` only if the prior window is verifiable, else `[]`). Prune-on-seed removes the $400 id.

- [ ] **Step 4: Chase Total Checking $300 → $400** — verify the raise and end date (brief: valid through 2026-10-14, $1,000+ direct deposits in 90 days). If verified: rename id to `chase-total-checking-400`, `bonus_amount_usd: 400`, `expiry_date: "2026-10-14"`, update the requirement text, add `offer_history: [{amount_usd: 300, valid_from: null, valid_to: "2026-09-23"}]` only if the change date is verified. Update any README/doc example that cites `chase-total-checking-300` (grep the repo: `grep -rn "chase-total-checking-300" --include=*.md --include=*.ts .`).

- [ ] **Step 4b: TD Beyond Checking renewal** — verify "back until 2026-11-30" on the TD/Doctor of Credit page; if verified set `expiry_date: "2026-11-30"` and add verification sources.

- [ ] **Step 5: M&T MyChoice Premium** — brief says re-verified to 2026-10-08; re-check the official M&T page and set `last_verified_date`. No change if identical.

- [ ] **Step 6: Capital One Venture** — add the year-one $300 Capital One Travel credit note to `requirements[]` **only if** verified on capitalone.com or by 3+ aggregators; label it "limited-time".

- [ ] **Step 7: Seed the 6 backlog records** (brief list): `chase-freedom-flex-250`, `citi-aadvantage-executive-125k`, `amex-business-checking-35k`, `wells-fargo-everyday-checking-500` (done in Step 3), `truist-one-checking-500` (exp 2027-02-02), `gbc-bank-easy-checking-400`. Their research lives in the prior session's notes — **check `~/AI-Workbench/team/` and `~/Knowledge/wiki/hot.md` and the Muse bridge (`~/Projects/agent-bridge/`) for the Sep 23 seed queue first**; if the data cannot be found, re-research each from the issuer page. Each record needs: all required schema fields, `source_url`, `verification`, `last_verified_date: "2026-09-30"`.

- [ ] **Step 8: New offers — only after issuer-page confirmation.** Citi Regular Checking $325 (brief: open by 2026-10-26; check nationwide online availability), Barclays Tiered Savings $200 (brief: ends 2026-10-31; first `savings` record → put in `seed-data/savings-bonuses.json`), PeoplesBank $350 (brief: MA/CT only, promo code Fall26, single source — **skip unless a second source or the issuer page confirms**). **Hold** Chase Freedom Unlimited $250 (brief: TPG says standard $200) until Chase's own page confirms.

- [ ] **Step 9: Validate and test** — `npm run build && node dist/seed.js` (Expected: `pruned` line lists the removed ids: `wells-fargo-everyday-checking-400`, `chase-total-checking-300`; no validation error). `npm run test` → PASS. `node dist/freshness-cli.js` → re-run; every changed record should no longer show `amount_missing`.

- [ ] **Step 10: Sanity-check the served data** — `node dist/cli.js search --pretty --limit 100 | grep -c '"id"'` (expect the new count), `node dist/cli.js expiring --days 14` (every entry has `expiry_date >= today`), and confirm no record lacks `source_url`.

- [ ] **Step 11: Commit**

```bash
git add -- seed-data README.md
git commit -m "Benefits City: data ops 2026-09-30 — source-verified swaps, renewals, new offers (D-1518 T7)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Cj6mF8e6XcyosYEvup19ET"
```
Record in the commit body (or `docs/` note) which brief claims did **not** verify and were left unchanged.

---

### Task 8: Connect one-liners, example prompts, agent docs

**Files:**
- Modify: `src/site.ts` (`agentsPage`, `llmsText`), `README.md`
- Test: extend `src/tests/surface.test.ts`

- [ ] **Step 1: Verify the real Claude Code connect command before writing it down** — Run `claude mcp add --help` and confirm the exact flags for an HTTP remote (expected form: `claude mcp add --transport http benefits-city <url>`). Use the verbatim syntax the help shows.

- [ ] **Step 2: Write failing test** (append to `surface.test.ts`):
```ts
test("agents page has per-client connect one-liners, example prompts, and discovery links", async () => {
  const { agentsPage, llmsText } = await import("../site.js");
  const ctx = { basePath: "/benefits", publicUrl: "https://aiagentscity.com/benefits" };
  const html = agentsPage(ctx);
  assert.match(html, /claude mcp add/);
  assert.match(html, /benefits_api_docs/);
  assert.match(html, /server\.json/);
  assert.match(html, /Try asking/i);
  const llms = llmsText(ctx);
  assert.match(llms, /benefits_examples/);
  assert.match(llms, /savings/);
  assert.match(llms, /auth\.md/);
});
```
Run `npm run test` → FAIL.

- [ ] **Step 3: Edit `agentsPage`** — after the existing "Connect" code blocks add:
  - `code("Claude Code — one line", esc("claude mcp add --transport http benefits-city " + mcpUrl))` (use the syntax confirmed in Step 1);
  - a **Muse** block reusing the `mcp-remote` JSON (Muse accepts MCP remotes — if unsure, label it "Any MCP client");
  - a "Try asking" list with exactly these three prompts: *"Which checking bonuses over $300 need no direct deposit, available in Texas?"*, *"What bonuses expire in the next 14 days?"*, *"Compare the Chase and Wells Fargo checking bonuses."*;
  - a "Self-serve" paragraph naming `benefits_api_docs`, `benefits_examples`, `server.json`, `auth.md`. Update the tools heading from four to six tools and list the two new ones.
  NEVER present a "paste this prompt and let your agent edit its own config" flow (agent-native standard item 3 — injection vector); only human-pasted one-liners.

- [ ] **Step 4: Edit `llmsText`** — add `benefits_api_docs`, `benefits_examples` to the Tools line, `savings` to `bonus_type`, new fields (`affiliate`-free: `sponsored`, `apply_url`, `verification`, `status`, `offer_history`, `eligibility`) to the schema paragraph, and lines for `${ctx.publicUrl}/server.json` and `${ctx.publicUrl}/auth.md`.

- [ ] **Step 5: Update `README.md`** — tool table (6 tools), data schema (new fields; `affiliate_url` is input-only and never published), run instructions (`npm run test`, `npm run freshness`), and the "What's stubbed" section (remove "No automated refresh"; keep the affiliate placeholder note).

- [ ] **Step 6: Run** `npm run test` → PASS; `npm run typecheck` → clean.

- [ ] **Step 7: Commit**

```bash
git add -- src/site.ts README.md src/tests/surface.test.ts
git commit -m "Benefits City: connect one-liners, example prompts, agent docs (D-1518 T8)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Cj6mF8e6XcyosYEvup19ET"
```

---

### Task 9: Gates — Morgan, Turing, desk + gate log

**Files:** `frame-cards/D-1518.md` (append results), `~/.claude/team/gate-log.csv` (append), `~/AI-Workbench/team/desk.md` (via the tool used by intake).

- [ ] **Step 1: Agent-Native Checklist** — append to `frame-cards/D-1518.md` a checklist of the 10 mandatory-surface items (rules/agent-native-standard.md), each ✅ shipped / ✅ planned / ➖ waived-with-reason: parity (MCP+REST+CLI ✅, SKILL.md ✅, auth.md ✅ T5), zero-friction auth ✅ (anonymous), connect one-liners ✅ T8, hardening (typed errors ✅, version header ✅, idempotency ➖ read-only service), meta-docs ✅ T4, registry+discovery ✅ T5 (publish 🔒), metered freemium ➖ waived (no paid tier yet), dogfood telemetry ✅ (existing metrics), ergonomics ✅, product skill surface ✅ (checker exit 0).

- [ ] **Step 2: Morgan review** — dispatch agent `morgan` with: the disclosure wording in `src/links.ts:disclosureShort`, the conditional disclosure-page text, the `SKILL.md` claims, `auth.md`, and the rule "no rate/fee claims without a live source". Morgan must return a verdict; record it with
`/opt/miniconda3/bin/python3 ~/AI-Workbench/scripts/record-role-review.py ...` (see `rules/claude-hermes-split.md` § Direct Canonical Role Fallback for arguments; note `execution_mode=direct` if not isolated). Fix every condition before proceeding.

- [ ] **Step 3: Turing review** — dispatch `turing` on the full branch diff (`git diff <base>..HEAD`) against spec + DoD (S1–S10, `rules/code-structure.md`). Also run the verification-before-completion checks fresh: `npm run test`, `npm run typecheck`, `node dist/freshness-cli.js --canary`, `/opt/miniconda3/bin/python3 ~/AI-Workbench/scripts/check-product-skills.py benefits-city`.

- [ ] **Step 4: Log gates** — append rows per `rules/gate-logging.md` (`morgan`, `turing`, `strat` (affiliate model checked in brainstorming — log `approved` with note), `prd`, `pre_impl_audit`, `ogilvy` = `n/a — no new content product in this sub-project`).

- [ ] **Step 5: Commit the card update**

```bash
git add -- frame-cards/D-1518.md
git commit -m "Benefits City: D-1518 gates + agent-native checklist

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Cj6mF8e6XcyosYEvup19ET"
```

---

### Task 10: 🔒 Deploy + live verification (principal approval required)

The live service is built from repo `entradox/agent-ledger-benefits-city` (Railway service `benefits-city`, proxy entry in `api_server.py` `_SATELLITE_MCP_UPSTREAMS`; see D-1408). **Do not push or deploy without the principal's explicit go and Morgan's clearance (Task 9).** Production changes are consent-boundary items (rules/auto-implement-critical-high.md §4).

- [ ] **Step 1:** Present the principal a one-screen summary: what changed, test/canary evidence, Morgan + Turing verdicts, and the exact deploy steps; ask for "deploy".
- [ ] **Step 2:** On approval, follow `rules/post-deploy-verification.md` and the Railway gotchas: confirm the linked directory, push, wait for green, then verify **against the live URL**:
```bash
B=https://aiagentscity.com/benefits
for p in /healthz /api/stats /server.json /.well-known/mcp.json /auth.md /llms.txt /agents /about /disclosure; do printf "%-26s " $p; curl -s -o /dev/null -w "%{http_code}\n" $B$p; done
curl -sI $B/healthz | grep -i x-api-version
curl -s $B/api/bonuses.json | grep -c affiliate_url        # expect 0
curl -s -X POST $B/mcp -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -o 'benefits_api_docs'
```
Expected: all `200`; `x-api-version: 2026-09-30`; `0`; `benefits_api_docs` present. Verify the **version string in all places** (package.json, meta.ts, server.json via the endpoint) agree with `/api`.
- [ ] **Step 3:** Confirm expired/removed ids 404 on `/bonuses/<id>` and the live offer count equals the seed count.
- [ ] **Step 4:** With approval, run Task 5 Step 7 (registry publish) and Task 6 Step 10 (cron wiring); verify each per its own expected output.
- [ ] **Step 5 (close):** Update `frame-cards/D-1518.md` with a Close section (every acceptance criterion from the spec §4 with its live evidence), write `~/AI-Workbench/team/session-handoffs/benefits-city.md` (rules/session-handoff.md format; "Next Immediate Action" = start affiliate signups + brainstorm sub-project 2), update `team/desk.md`, and tell the principal the affiliate-signup checklist is ready (deliverable from spec §3.3).

---

## Self-Review (run against the spec)

- **§3.1 data model** → Task 1 (types, normalize defaults, validation, legacy test). ✅
- **§3.2 freshness** → Task 6 (classifier, robots-aware fetch, review queue, canary, cron 🔒 step); "expired filtered on all surfaces" → Task 1 + Task 5 HTTP test; "verified on issuer page badge only when fetched" → `verification.method` captured in Task 7 (display of the badge is a later sub-project; this plan records the data only — noted, not silently dropped).
- **§3.3 link layer** → Task 2 (resolve, sponsored, hidden raw URL, conditional disclosure, sort test); network checklist deliverable → Task 10 Step 5.
- **§3.4 agent discoverability** → Tasks 4, 5, 8 (docs/examples tools, typed errors, version header, skill resource, server.json/auth.md/well-known, connect one-liners); registry publish 🔒.
- **§3.5 data ops** → Task 7. **§4 acceptance 1–7** → expired never served (T1, T5), changed-amount flagged (T6), sort test (T2), endpoints 200 + registry (T5, T10), canary (T6), disclosure + Morgan + Turing (T2, T9), validate/typecheck (every task).
- **Placeholder scan:** no TBD/TODO; Task 7 values are explicitly "claims to verify", with the procedure and the keep-unchanged fallback.
- **Type consistency:** `PublicBonus`/`toPublic` (T2) used in T3, T4, T5; `FetchResult`/`Finding`/`classify` signatures identical across T6 tests, module and CLI; `syncSeed` returns `{upserted, removed}` in T1 test and code; `API_VERSION` value `2026-09-30` identical in T4 and T5 tests.
- **Known deferral (visible):** the public "verified on issuer page" badge, offer-history pages and planner are sequenced roadmap items 5/3, not this plan.
