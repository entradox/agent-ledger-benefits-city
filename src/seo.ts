/**
 * Benefits City — programmatic SEO page model (PURE data; no HTML).
 *
 * Rules that keep these pages useful instead of spammy:
 *  - a page exists only if it has at least one served offer (no empty/thin pages);
 *  - a state page exists only for a state that has at least one REGIONAL offer — otherwise every
 *    state page would just repeat the nationwide list;
 *  - everything shown is derived from the served data (listAll / expiringSoon), nothing is invented.
 * seoPaths() is the single list the sitemap and the routes both agree on.
 */
import { byValue, expiringSoon, listAll } from "./db.js";
import type { Bonus, BonusType } from "./types.js";
import { STATE_NAMES } from "./contract.js";

export { STATE_NAMES };

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export interface IssuerGroup {
  slug: string;
  name: string;
  offers: Bonus[];
}

/** Groups served offers by issuer. Two DIFFERENT issuer names that slugify identically (e.g. "M&T Bank" and
 *  "M T Bank") must never share a page — that would label one bank's offers with another's name — so they get
 *  deterministic distinct slugs (alphabetically first keeps the base slug, the rest get -2, -3, ...). */
export function issuerGroups(): IssuerGroup[] {
  const bySlug = new Map<string, Map<string, Bonus[]>>();
  for (const b of listAll()) {
    const slug = slugify(b.bank_or_issuer);
    if (!slug) continue;
    const names = bySlug.get(slug) ?? new Map<string, Bonus[]>();
    names.set(b.bank_or_issuer, [...(names.get(b.bank_or_issuer) ?? []), b]);
    bySlug.set(slug, names);
  }
  const groups: IssuerGroup[] = [];
  for (const [slug, names] of bySlug) {
    [...names.keys()].sort().forEach((name, i) => {
      groups.push({ slug: i === 0 ? slug : `${slug}-${i + 1}`, name, offers: names.get(name)!.sort(byValue) });
    });
  }
  return groups.sort((a, b) => a.slug.localeCompare(b.slug));
}

export function issuerBySlug(slug: string): IssuerGroup | null {
  return issuerGroups().find((g) => g.slug === slug) ?? null;
}


export interface RegionalState {
  code: string;
  name: string;
  offers: Bonus[];
}

export function regionalStates(): RegionalState[] {
  const map = new Map<string, Bonus[]>();
  for (const b of listAll()) {
    if (!Array.isArray(b.states_available)) continue;
    for (const code of new Set(b.states_available.map((raw) => String(raw).toUpperCase()))) {
      if (!Object.hasOwn(STATE_NAMES, code)) continue;
      map.set(code, [...(map.get(code) ?? []), b]);
    }
  }
  return [...map.entries()]
    .map(([code, offers]) => ({ code, name: STATE_NAMES[code], offers: offers.sort(byValue) }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

/** Duplicate-content guard. A state page is worth a search engine's attention only when it adds something the
 *  others don't: at least 2 regional offers AND a regional set that no other state shares (otherwise 6 states
 *  that all share one offer would be 6 near-identical pages differing only by the state's name). The other state
 *  pages still exist for visitors (and are linked from /states) but are noindex and out of the sitemap. */
export function indexableStates(): RegionalState[] {
  const all = regionalStates();
  const key = (s: RegionalState) => s.offers.map((o) => o.id).sort().join("|");
  const counts = new Map<string, number>();
  for (const s of all) counts.set(key(s), (counts.get(key(s)) ?? 0) + 1);
  return all.filter((s) => s.offers.length >= 2 && counts.get(key(s)) === 1);
}

export function stateOffers(code: string): { code: string; name: string; regional: Bonus[]; nationwide: Bonus[] } | null {
  const up = code.toUpperCase();
  const st = regionalStates().find((s) => s.code === up);
  if (!st) return null;
  const nationwide = listAll().filter((b) => b.states_available === "nationwide").sort(byValue);
  return { code: up, name: st.name, regional: st.offers, nationwide };
}

/** One `/best/<slug>` axis: which records qualify, how they are ordered, and the ranking statement
 *  the page publishes. `basis` must describe what `rank` actually does — a page whose copy and its
 *  order disagree is a false claim about our own data. */
export interface BestAxis {
  type: BonusType;
  label: string;
  basis: string;
  select?: (b: Bonus) => boolean;
  rank: (a: Bonus, b: Bonus) => number;
}

export const BEST_TYPES: Record<string, BestAxis> = {
  "bank-account": { type: "bank_account", label: "bank account", basis: "Ranked by stated bonus amount", rank: byValue },
  "credit-card": {
    type: "credit_card",
    label: "credit card",
    basis: "Ranked by stated bonus amount (estimated USD value of points)",
    rank: byValue,
  },
  savings: { type: "savings", label: "savings account", basis: "Ranked by stated bonus amount", rank: byValue },
  brokerage: { type: "brokerage", label: "brokerage", basis: "Ranked by stated bonus amount", rank: byValue },
  /**
   * Balance-transfer cards carry no signup bonus by design, so the bonus-amount axis can never
   * surface them — a $0 record sorts below every card that has one, forever. This axis ranks by
   * the intro window the issuer states on transferred balances instead, with the cheaper transfer
   * fee breaking ties. A record with no stated balance-transfer terms is not eligible here at all.
   */
  "balance-transfer": {
    type: "credit_card",
    label: "balance-transfer",
    basis:
      "Ranked by the length of the intro window the issuer states on balance transfers, with the cheaper transfer fee as the tie-break",
    select: (b) => b.bt_intro_months != null,
    rank: byTransferWindow,
  },
};

/** Longest stated intro window first; then the cheaper transfer fee (an unstated fee sorts last);
 *  then the larger bonus; then id — so the order is total and stable, never dependent on input order. */
export function byTransferWindow(a: Bonus, b: Bonus): number {
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
}

export function bestOffers(slug: string, limit = 10): Bonus[] | null {
  const axis: BestAxis | undefined = Object.hasOwn(BEST_TYPES, slug) ? BEST_TYPES[slug] : undefined;
  if (!axis) return null;
  const offers = listAll()
    .filter((b) => b.bonus_type === axis.type && (!axis.select || axis.select(b)))
    .sort(axis.rank)
    .slice(0, limit);
  return offers.length ? offers : null;
}

export function expiringWithin30(): Bonus[] {
  return expiringSoon(30);
}

/** Every SEO page that really exists right now. Routes and sitemap both use this. */
export function seoPaths(): string[] {
  const groups = issuerGroups();
  if (groups.length === 0) return [];
  const paths = ["/banks", ...groups.map((g) => `/banks/${g.slug}`)];
  const states = indexableStates();
  if (states.length) paths.push("/states", ...states.map((s) => `/states/${s.code.toLowerCase()}`));
  for (const slug of Object.keys(BEST_TYPES)) if (bestOffers(slug)) paths.push(`/best/${slug}`);
  if (expiringWithin30().length) paths.push("/expiring-soon");
  return paths;
}
