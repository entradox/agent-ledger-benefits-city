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

/**
 * Operational door for partner links: `AFFILIATE_URLS` as a JSON object of { recordId: "https://track/…" }.
 * It exists so a partner link can go live, be rotated, or be pulled the moment a network approves us —
 * an env change, not a data change plus a deploy. Nothing else about the rail changes: the URL is
 * consumed only by /go/:id and is never published in any surface (see isPublishedAffiliateInvariant).
 *
 * Precedence: an env entry WINS over the record's own `affiliate_url`, so a stale committed URL can be
 * replaced or withdrawn without touching seed data. Values that are not http(s) are ignored — this must
 * never become a way to redirect someone to a malformed or non-web target. Unknown ids are ignored.
 */
let affCacheKey: string | null = null;
let affCache: Record<string, string> = {};

export function affiliateUrls(): Record<string, string> {
  const raw = process.env.AFFILIATE_URLS ?? "";
  if (raw === affCacheKey) return affCache;
  affCacheKey = raw;
  affCache = {};
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === "string" && isHttpUrl(v)) affCache[k] = v;
        }
      }
    } catch {
      /* a malformed AFFILIATE_URLS must not break the site: no links become affiliate, everything
         keeps pointing at the issuer, and the disclosure stays in its honest non-affiliate state. */
    }
  }
  return affCache;
}

/** The partner URL that actually applies to this record: the env door if it names one, else the record. */
export function effectiveAffiliateUrl(b: Bonus): string | null {
  const fromEnv = affiliateUrls()[b.id];
  if (isHttpUrl(fromEnv)) return fromEnv;
  return isHttpUrl(b.affiliate_url) ? b.affiliate_url : null;
}

/** Destination for /go/:id: affiliate URL, else issuer page, else source page (first valid). */
export function resolveApplyUrl(b: Bonus): string | null {
  for (const c of [effectiveAffiliateUrl(b), b.application_url, b.source_url]) if (isHttpUrl(c)) return c;
  return null;
}

export function isSponsored(b: Bonus): boolean {
  return effectiveAffiliateUrl(b) !== null;
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
    ? "Some Apply links are affiliate links: we earn a commission if you open an account through them, at no extra cost to you. Commissions never influence which offers we list or how we order them."
    : "Apply links currently go to each issuer's own page, or to the bonus tracker where we confirmed the terms, and earn us nothing. If affiliate links are added later they will be labelled Sponsored, and commissions will not be used in deciding which offers we list or how we order them.";
}
