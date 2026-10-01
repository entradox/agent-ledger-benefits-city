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

/** Today's calendar date in US Eastern time (YYYY-MM-DD). Bank offers state deadlines as US dates
 *  (typically 11:59 PM ET), so an offer valid through 9/30 must still be served all day on 9/30 —
 *  a UTC date would hide it from 8pm ET. */
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
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
  const d = new Date(`${todayISO()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
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
