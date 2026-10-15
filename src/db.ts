import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LIMITS } from "./contract.js";
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
    // Optional-by-intent fields. MCP validates EVERY declared outputSchema property as required, so
    // an absent key fails the whole structured-content response with -32602 — an empty result where
    // a caller asked a plain question. Default them here rather than trusting every seed record.
    bonus_max_usd: raw.bonus_max_usd ?? null,
    bonus_points: raw.bonus_points ?? null,
    annual_fee_usd: raw.annual_fee_usd ?? null,
    bt_intro_apr_pct: raw.bt_intro_apr_pct ?? null,
    bt_intro_months: raw.bt_intro_months ?? null,
    bt_fee_pct: raw.bt_fee_pct ?? null,
    bt_fee_min_usd: raw.bt_fee_min_usd ?? null,
    expiry_date: raw.expiry_date ?? null,
    min_deposit_usd: raw.min_deposit_usd ?? null,
    source_url: raw.source_url ?? null,
    last_verified_date: raw.last_verified_date ?? null,
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
const ET_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }); // built once: construction is the cost
export function todayISO(now: Date = new Date()): string {
  return ET_DATE.format(now);
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
  /** Case-insensitive substring match on bank/issuer, product name, or the offer's own requirement
   *  text. The requirement text is included so a plain-language search for a term the catalogue is
   *  ABOUT still finds it — "balance transfer" matched nothing when this was name-only, on a
   *  catalogue that had just gained a balance-transfer axis. */
  query?: string;
  /** Only records whose issuer states an intro rate on transferred balances (the /best/balance-transfer
   *  axis). When set, results are ordered by intro window rather than by bonus value — a balance-transfer
   *  card has no signup bonus, so value-ordering would bury exactly the records this filter selects. */
  balance_transfer?: boolean;
  limit?: number;
}

/** Deterministic, commission-independent ordering: value desc, then id asc. */
export const byValue = (a: Bonus, b: Bonus): number =>
  b.bonus_amount_usd - a.bonus_amount_usd || a.id.localeCompare(b.id);

/** Longest stated intro window first; then the cheaper transfer fee (an unstated fee sorts last);
 *  then the larger bonus; then id — a total, stable order, never dependent on input order. Shared by
 *  /best/balance-transfer and search_bonuses({ balance_transfer: true }). */
export const byTransferWindow = (a: Bonus, b: Bonus): number => {
  const months = (b.bt_intro_months ?? -1) - (a.bt_intro_months ?? -1);
  if (months !== 0) return months;
  const fa = a.bt_fee_pct;
  const fb = b.bt_fee_pct;
  if (fa !== fb) {
    if (fa == null) return 1;
    if (fb == null) return -1;
    return fa - fb;
  }
  const value = byValue(a, b);
  return value !== 0 ? value : a.id.localeCompare(b.id);
};

export function searchBonuses(f: SearchFilters = {}): Bonus[] {
  const s = getDb();
  const today = todayISO();
  let out = s.bonuses.filter((b) => isServable(b, today));
  if (f.bonus_type) out = out.filter((b) => b.bonus_type === f.bonus_type);
  if (f.min_bonus_amount_usd != null) out = out.filter((b) => b.bonus_amount_usd >= (f.min_bonus_amount_usd as number));
  if (f.direct_deposit_required != null)
    out = out.filter((b) => b.direct_deposit_required === f.direct_deposit_required);
  if (f.query) {
    const q = f.query.toLowerCase();
    out = out.filter(
      (b) =>
        b.bank_or_issuer.toLowerCase().includes(q) ||
        b.product_name.toLowerCase().includes(q) ||
        b.requirements.some((r) => r.toLowerCase().includes(q)),
    );
  }
  if (f.balance_transfer === true) out = out.filter((b) => b.bt_intro_months != null);
  if (f.state) {
    const st = f.state.toUpperCase();
    out = out.filter(
      (b) =>
        b.states_available === "nationwide" ||
        (Array.isArray(b.states_available) &&
          b.states_available.map((x) => x.toUpperCase()).includes(st)),
    );
  }
  out.sort(f.balance_transfer === true ? byTransferWindow : byValue);
  const limit = Math.min(Math.max(f.limit ?? LIMITS.limit.default, LIMITS.limit.min), LIMITS.limit.max);
  return out.slice(0, limit);
}

export function getBonusById(id: string): Bonus | undefined {
  const today = todayISO();
  return getDb().bonuses.find((b) => b.id === id && isServable(b, today));
}

export function listAll(): Bonus[] {
  const today = todayISO();
  return getDb()
    .bonuses.filter((b) => isServable(b, today))
    .sort((a, b) => a.bonus_type.localeCompare(b.bonus_type) || byValue(a, b));
}

function addDaysISO(days: number, from: string = todayISO()): string {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The one definition of "expiring within N days" (used by expiringSoon, the SEO page and insights). */
export function isExpiringWithin(b: Bonus, days: number, today: string = todayISO()): boolean {
  return isServable(b, today) && b.expiry_date != null && b.expiry_date >= today && b.expiry_date <= addDaysISO(days, today);
}

/** Bonuses with a stated expiry date falling within the next `days` days, soonest first. */
export function expiringSoon(days = 30): Bonus[] {
  const today = todayISO();
  return getDb()
    .bonuses.filter((b) => isExpiringWithin(b, days, today))
    .sort((a, b) => (a.expiry_date as string).localeCompare(b.expiry_date as string));
}
