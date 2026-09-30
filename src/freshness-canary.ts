import type { FetchResult } from "./freshness.js";
import type { Bonus } from "./types.js";

function rec(id: string, amount: number): Bonus {
  return {
    id,
    bank_or_issuer: "Canary Bank",
    product_name: "Canary",
    bonus_type: "bank_account",
    bonus_amount_usd: amount,
    bonus_points: null,
    annual_fee_usd: null,
    requirements: [],
    min_deposit_usd: null,
    direct_deposit_required: false,
    expiry_date: "2999-12-31",
    states_available: "nationwide",
    application_url: null,
    source_url: "https://example.invalid",
    last_verified_date: null,
    affiliate_url: null,
    offer_history: [],
    verification: null,
    status: "active",
    eligibility: null,
  };
}
const page = (t: string): FetchResult => ({ status: 200, text: `<p>${t}</p>` });

/** Known-good and known-bad inputs. The canary asserts they land on opposite sides. */
export function makeCanaryFixtures() {
  return {
    good: { record: rec("canary-good", 300), fetched: page("Earn $300 when you open an account") },
    bad: [
      { record: rec("canary-amount", 300), fetched: page("Earn $400 when you open an account") },
      { record: rec("canary-gone", 300), fetched: { status: 404, text: "" } as FetchResult },
      { record: rec("canary-blocked", 300), fetched: { status: 403, text: "Access Denied" } as FetchResult },
      { record: rec("canary-null", 300), fetched: null },
    ],
  };
}
