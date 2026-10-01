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
export type FindingKind = "ok" | "expired" | "amount_missing" | "changed" | "blocked" | "unreachable" | "gone" | "stale";
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
  if (fetched.status === 404 || fetched.status === 410)
    return f("gone", `HTTP ${fetched.status} — a human must confirm before removal`);
  if ([401, 403, 429, 503].includes(fetched.status) || BLOCK_PATTERNS.test(fetched.text))
    return f("blocked", `HTTP ${fetched.status} / bot-block page — NOT evidence the offer is dead`);

  const text = visibleText(fetched.text);
  const needles = amountNeedles(b);
  if (needles.length && !needles.some((n) => text.includes(n.toLowerCase())))
    return f("amount_missing", `page does not mention ${needles[0]} — amount may have changed`);

  const hash = hashText(fetched.text);
  if (priorHash && priorHash !== hash)
    return { finding: { id: b.id, kind: "changed", detail: "page content changed since last run" }, hash };
  return { finding: { id: b.id, kind: "ok", detail: "amount present" }, hash };
}

const INFORMATIONAL: FindingKind[] = ["blocked", "unreachable"];

/** Days a record may go without a human/source verification before it is reported (the SLA in
 *  REFRESH_PLAN.md: "no record served with last_verified_date older than 30 days"). */
export const STALE_AFTER_DAYS = 30;

/** Actionable finding when last_verified_date is missing or older than STALE_AFTER_DAYS. This is
 *  what makes "blocked is informational" safe: a record the job can never read still gets a
 *  human re-check on a clock. */
export function staleFinding(b: Bonus, today: string = todayISO()): Finding | null {
  if (!b.last_verified_date) return { id: b.id, kind: "stale", detail: "no last_verified_date" };
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${b.last_verified_date}T00:00:00Z`)) / 86_400_000);
  return days > STALE_AFTER_DAYS
    ? { id: b.id, kind: "stale", detail: `last verified ${days} days ago (SLA ${STALE_AFTER_DAYS})` }
    : null;
}

/** 0 = nothing actionable · 1 = a human must look · 3 = no data at all (never a pass).
 *  blocked/unreachable are informational per record (issuer pages routinely block bots; the
 *  consensus tier and the stale clock cover them) — but if EVERY record came back blocked or
 *  unreachable, the job learned nothing and must say so rather than read as clean. */
export function exitCodeFor(findings: Finding[], checked: number): 0 | 1 | 3 {
  const blind = new Set(findings.filter((f) => INFORMATIONAL.includes(f.kind)).map((f) => f.id));
  if (checked > 0 && blind.size >= checked) return 3;
  return findings.some((f) => !INFORMATIONAL.includes(f.kind)) ? 1 : 0;
}
