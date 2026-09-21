import { getBonusById } from "./db.js";
import type { Bonus } from "./types.js";

export interface Comparison {
  bonuses: Bonus[];
  summary: {
    /** id of the offer with the highest bonus_amount_usd */
    highest_bonus_usd: string;
    /** id of the offer with the earliest stated expiry, or null */
    earliest_expiry: string | null;
  };
}

/** Side-by-side comparison of 2-4 bonus ids. Throws on unknown ids. */
export function compareBonuses(ids: string[]): Comparison {
  const bonuses = ids.map((id) => getBonusById(id));
  const missing = ids.filter((_, i) => !bonuses[i]);
  if (missing.length > 0) {
    throw new Error(`Unknown bonus id(s): ${missing.join(", ")}`);
  }
  const list = bonuses as Bonus[];
  const withExpiry = list.filter((b) => b.expiry_date);
  return {
    bonuses: list,
    summary: {
      highest_bonus_usd: [...list].sort((a, b) => b.bonus_amount_usd - a.bonus_amount_usd)[0].id,
      earliest_expiry:
        withExpiry.sort((a, b) =>
          (a.expiry_date as string).localeCompare(b.expiry_date as string),
        )[0]?.id ?? null,
    },
  };
}
