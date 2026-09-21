export type BonusType = "bank_account" | "credit_card";

/** A single bank account or credit card signup bonus offer. */
export interface Bonus {
  /** kebab-case unique id, e.g. "chase-total-checking-300" */
  id: string;
  /** e.g. "Chase" */
  bank_or_issuer: string;
  /** e.g. "Total Checking" */
  product_name: string;
  bonus_type: BonusType;
  /** Advertised bonus in USD. For credit cards: estimated USD value of the points/miles bonus. */
  bonus_amount_usd: number;
  /** Points/miles granted (credit cards), null otherwise */
  bonus_points: number | null;
  /** Annual fee in USD (credit cards), null if none/unknown */
  annual_fee_usd: number | null;
  /** Plain-English qualifying requirements */
  requirements: string[];
  /** Minimum opening deposit in USD, null if none/unknown */
  min_deposit_usd: number | null;
  direct_deposit_required: boolean;
  /** "YYYY-MM-DD" or null when the bank states no end date */
  expiry_date: string | null;
  /** "nationwide" or array of 2-letter US state codes */
  states_available: string | string[];
  /** STUBBED for now: official application page URL; replaced by affiliate link later */
  application_url: string | null;
  /** Page where the live terms were confirmed */
  source_url: string | null;
  /** "YYYY-MM-DD" the terms were last confirmed */
  last_verified_date: string | null;
}

/** Raw shape accepted from seed JSON files (some fields optional, defaults applied). */
export type SeedBonus = Partial<Bonus> &
  Pick<Bonus, "id" | "bank_or_issuer" | "product_name" | "bonus_type" | "bonus_amount_usd">;
