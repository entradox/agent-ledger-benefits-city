/**
 * Benefits City — live stats computed from the real seed data.
 * The landing page and /api/stats both read from here, so numbers on the
 * site can never go stale relative to the database.
 */
import { expiringSoon, getDb } from "./db.js";
import { liveCounters } from "./metrics.js";
import type { Bonus } from "./types.js";

export interface Stats {
  total_offers: number;
  bank_account_offers: number;
  credit_card_offers: number;
  /** Sum of bonus_amount_usd across all offers (credit cards are estimated USD values). */
  total_bonus_usd: number;
  highest_bonus: Bonus | null;
  expiring_within_30d: Bonus[];
  /** Max last_verified_date across records, or null. */
  last_verified: string | null;
  /** Rolling 24h usage counters. All three are 0 when metrics are disabled. */
  visitors_24h: number;
  apply_clicks_24h: number;
  mcp_calls_24h: number;
  generated_at: string;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getStats(): Stats {
  const bonuses = getDb().bonuses;
  const bank = bonuses.filter((b) => b.bonus_type === "bank_account");
  const cards = bonuses.filter((b) => b.bonus_type === "credit_card");
  const total = bonuses.reduce((sum, b) => sum + (b.bonus_amount_usd || 0), 0);
  const highest = bonuses.reduce<Bonus | null>(
    (best, b) => (!best || b.bonus_amount_usd > best.bonus_amount_usd ? b : best),
    null,
  );
  const verified = bonuses
    .map((b) => b.last_verified_date)
    .filter((d): d is string => d != null)
    .sort();
  return {
    total_offers: bonuses.length,
    bank_account_offers: bank.length,
    credit_card_offers: cards.length,
    total_bonus_usd: Math.round(total),
    highest_bonus: highest,
    expiring_within_30d: expiringSoon(30),
    last_verified: verified.length ? verified[verified.length - 1] : null,
    ...liveCounters(),
    generated_at: todayISO(),
  };
}

/** Whole days from today until an expiry date (negative if past). */
export function daysUntil(expiryDate: string | null): number | null {
  if (!expiryDate) return null;
  const today = new Date(todayISO() + "T00:00:00Z").getTime();
  const exp = new Date(expiryDate + "T00:00:00Z").getTime();
  return Math.round((exp - today) / 86_400_000);
}

export function formatUsd(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

export function formatDate(iso: string | null): string {
  if (!iso) return "No stated end date";
  const [y, m, d] = iso.split("-").map(Number);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[m - 1]} ${d}, ${y}`;
}
