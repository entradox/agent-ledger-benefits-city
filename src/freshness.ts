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

/** 0 = nothing actionable · 1 = a human must look · 3 = no data at all (never a pass).
 *  blocked/unreachable are informational (issuer pages routinely block bots; the consensus tier
 *  covers them) — otherwise the alarm would be permanently on and ignored. */
export function exitCodeFor(findings: Finding[], checked: number): 0 | 1 | 3 {
  if (checked > 0 && findings.filter((f) => f.kind === "unreachable").length === checked) return 3;
  return findings.some((f) => !INFORMATIONAL.includes(f.kind)) ? 1 : 0;
}
