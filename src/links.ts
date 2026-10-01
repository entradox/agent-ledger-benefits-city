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
    ? "Some Apply links are affiliate links: we earn a commission if you open an account through them, at no extra cost to you. Commissions never influence which offers we list or how we order them."
    : "Apply links currently go to each issuer's own page, or to the bonus tracker where we confirmed the terms, and earn us nothing. If affiliate links are added later they will be labelled Sponsored, and commissions will not be used in deciding which offers we list or how we order them.";
}
