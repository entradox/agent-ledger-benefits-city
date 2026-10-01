/**
 * Benefits City — original, citable statistics computed live from the served offers (PURE given its input).
 * Every figure states its denominator. Freshness is published as a RANGE (oldest/newest source check) plus the
 * computation date — a single "as of" would let one fresh check make a stale dataset look current.
 * An empty or one-sided dataset yields nulls, never NaN/Infinity.
 */
import { checkRange } from "./checks.js";
import { isExpiringWithin, listAll, todayISO } from "./db.js";
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
  const med = median(of.map((b) => b.bonus_amount_usd));
  if (type === "credit_card") {
    // card values are ESTIMATES of points' worth: the field names say so, so a quoted median is never read as cash
    return {
      count: of.length,
      median_estimated_value_usd: med,
      highest_estimated_value_usd: top ? top.bonus_amount_usd : null,
      highest_offer_id: top ? top.id : null,
      value_basis: "estimated USD value of points",
    };
  }
  return {
    count: of.length,
    median_bonus_usd: med,
    highest_bonus_usd: top ? top.bonus_amount_usd : null,
    highest_offer_id: top ? top.id : null,
  };
}

export function insights(offers: Bonus[] = listAll(), publicUrl: string = publicBase()): object {
  const today = todayISO();
  const base = publicUrl.replace(/\/+$/, "");
  const bank = offers.filter((b) => b.bonus_type === "bank_account");
  const needDd = bank.filter((b) => b.direct_deposit_required).length;
  const { oldest, newest } = checkRange(offers);
  return {
    computed_at: today,
    oldest_check: oldest,
    newest_check: newest,
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
    expiring_within_30_days: offers.filter((b) => isExpiringWithin(b, 30, today)).length,
    scope: "Only the offers Benefits City tracks; not a market-wide or industry-wide total.",
    method: "Computed live from the offers Benefits City currently serves; each offer is checked against a named source (issuer page or bonus trackers). Card values are estimates.",
    source: `Benefits City — US bank, savings and credit-card signup bonuses (${base})`,
    attribution: `Source: Benefits City (${base}), computed ${today}; offers last checked ${oldest ?? "n/a"} to ${newest ?? "n/a"}`,
  };
}
