export type BonusType = "bank_account" | "credit_card" | "savings";
export type BonusStatus = "active" | "expired" | "needs_review";

export interface OfferHistoryEntry {
  amount_usd: number;
  /** "YYYY-MM-DD" or null when unknown */
  valid_from: string | null;
  valid_to: string | null;
}

export interface Verification {
  /** issuer_page = we fetched the issuer's own page; aggregator_consensus = 3+ reputable listings agree */
  method: "issuer_page" | "aggregator_consensus";
  /** "YYYY-MM-DD" */
  verified_at: string;
  sources: string[];
}

/** Structured eligibility facts (nullable = unknown). Consumed by the later planner sub-project. */
export interface Eligibility {
  new_to_bank: boolean | null;
  once_per_lifetime: boolean | null;
  cooldown_months: number | null;
  issuer_rules: string[];
}

/** A single bank account, savings account, or credit card signup bonus offer. */
export interface Bonus {
  /** kebab-case unique id, e.g. "chase-total-checking-400" */
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
  /** The issuer's own offer/application page (never an affiliate URL) */
  application_url: string | null;
  /** Partner-tracked URL; used by /go/:id when present. NEVER published in feeds/MCP/CLI. */
  affiliate_url: string | null;
  /** Page where the live terms were confirmed */
  source_url: string | null;
  /** "YYYY-MM-DD" the terms were last confirmed */
  last_verified_date: string | null;
  offer_history: OfferHistoryEntry[];
  verification: Verification | null;
  status: BonusStatus;
  eligibility: Eligibility | null;
}

/** Raw shape accepted from seed JSON files (some fields optional, defaults applied). */
export type SeedBonus = Partial<Bonus> &
  Pick<Bonus, "id" | "bank_or_issuer" | "product_name" | "bonus_type" | "bonus_amount_usd">;
