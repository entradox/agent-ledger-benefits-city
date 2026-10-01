/**
 * Benefits City — original, citable statistics computed live from the served offers (PURE given its input).
 * Every figure states its denominator and the data date, so a journalist or an LLM can quote it
 * correctly. An empty or one-sided dataset yields nulls, never NaN/Infinity.
 */
import { listAll, todayISO } from "./db.js";
import { publicBase } from "./links.js";
import type { Bonus, BonusType } from "./types.js";

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function typeStats(offers: Bonus[], type: BonusType) {
  const of = offers.filter((b) => b.bonus_type === type);
  const top = of.reduce<Bonus | null>((best, b) => (!best || b.bonus_amount_usd > best.bonus_amount_usd ? b : best), null);
  return {
    count: of.length,
    median_bonus_usd: median(of.map((b) => b.bonus_amount_usd)),
    highest_bonus_usd: top ? top.bonus_amount_usd : null,
    highest_offer_id: top ? top.id : null,
    ...(type === "credit_card" ? { value_basis: "estimated USD value of points" } : {}),
  };
}

export function insights(offers: Bonus[] = listAll()): object {
  const today = todayISO();
  const cutoffDate = new Date(`${today}T00:00:00Z`);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() + 30);
  const cutoff = cutoffDate.toISOString().slice(0, 10);
  const bank = offers.filter((b) => b.bonus_type === "bank_account");
  const needDd = bank.filter((b) => b.direct_deposit_required).length;
  const dates = offers.map((b) => b.last_verified_date).filter((d): d is string => Boolean(d)).sort();
  const base = publicBase();
  const asOf = dates.length ? dates[dates.length - 1] : null;
  return {
    as_of: asOf,
    total_offers: offers.length,
    by_type: {
      bank_account: typeStats(offers, "bank_account"),
      credit_card: typeStats(offers, "credit_card"),
      savings: typeStats(offers, "savings"),
    },
    bank_account_direct_deposit: {
      requires_direct_deposit: needDd,
      of: bank.length,
      share: bank.length ? Math.round((needDd / bank.length) * 100) / 100 : null,
    },
    expiring_within_30_days: offers.filter((b) => b.expiry_date != null && b.expiry_date >= today && b.expiry_date <= cutoff).length,
    method: "Computed live from the offers Benefits City currently serves; each offer is checked against a named source (issuer page or bonus trackers). Card values are estimates.",
    source: `Benefits City — US bank, savings and credit-card signup bonuses (${base})`,
    attribution: `Source: Benefits City (${base}), data as of ${asOf ?? "n/a"}`,
  };
}
