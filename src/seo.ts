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
import { expiringSoon, listAll } from "./db.js";
import type { Bonus, BonusType } from "./types.js";

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const byValue = (a: Bonus, b: Bonus): number => b.bonus_amount_usd - a.bonus_amount_usd || a.id.localeCompare(b.id);

export interface IssuerGroup {
  slug: string;
  name: string;
  offers: Bonus[];
}

export function issuerGroups(): IssuerGroup[] {
  const map = new Map<string, IssuerGroup>();
  for (const b of listAll()) {
    const slug = slugify(b.bank_or_issuer);
    if (!slug) continue;
    const g = map.get(slug) ?? { slug, name: b.bank_or_issuer, offers: [] };
    g.offers.push(b);
    map.set(slug, g);
  }
  for (const g of map.values()) g.offers.sort(byValue);
  return [...map.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

export function issuerBySlug(slug: string): IssuerGroup | null {
  return issuerGroups().find((g) => g.slug === slug) ?? null;
}

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export interface RegionalState {
  code: string;
  name: string;
  offers: Bonus[];
}

export function regionalStates(): RegionalState[] {
  const map = new Map<string, Bonus[]>();
  for (const b of listAll()) {
    if (!Array.isArray(b.states_available)) continue;
    for (const raw of b.states_available) {
      const code = String(raw).toUpperCase();
      if (!Object.hasOwn(STATE_NAMES, code)) continue;
      map.set(code, [...(map.get(code) ?? []), b]);
    }
  }
  return [...map.entries()]
    .map(([code, offers]) => ({ code, name: STATE_NAMES[code], offers: offers.sort(byValue) }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function stateOffers(code: string): { code: string; name: string; regional: Bonus[]; nationwide: Bonus[] } | null {
  const up = code.toUpperCase();
  const st = regionalStates().find((s) => s.code === up);
  if (!st) return null;
  const nationwide = listAll().filter((b) => b.states_available === "nationwide").sort(byValue);
  return { code: up, name: st.name, regional: st.offers, nationwide };
}

export const BEST_TYPES: Record<string, { type: BonusType; label: string }> = {
  "bank-account": { type: "bank_account", label: "bank account" },
  "credit-card": { type: "credit_card", label: "credit card" },
  savings: { type: "savings", label: "savings account" },
};

export function bestOffers(slug: string, limit = 10): Bonus[] | null {
  if (!Object.hasOwn(BEST_TYPES, slug)) return null;
  const t = BEST_TYPES[slug].type;
  const offers = listAll().filter((b) => b.bonus_type === t).sort(byValue).slice(0, limit);
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
  const states = regionalStates();
  if (states.length) paths.push("/states", ...states.map((s) => `/states/${s.code.toLowerCase()}`));
  for (const slug of Object.keys(BEST_TYPES)) if (bestOffers(slug)) paths.push(`/best/${slug}`);
  if (expiringWithin30().length) paths.push("/expiring-soon");
  return paths;
}
