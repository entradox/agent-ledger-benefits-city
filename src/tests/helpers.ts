import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Bonus } from "../types.js";

/** Date `offsetDays` from today, where "today" is the US Eastern calendar date (the app's definition). */
export function iso(offsetDays: number): string {
  const base = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function makeBonus(o: Partial<Bonus> = {}): Bonus {
  return {
    id: "test-offer",
    bank_or_issuer: "Test Bank",
    product_name: "Test Checking",
    bonus_type: "bank_account",
    bonus_amount_usd: 300,
    bonus_max_usd: null,
    bonus_points: null,
    annual_fee_usd: null,
    requirements: ["Open an account"],
    min_deposit_usd: null,
    direct_deposit_required: false,
    expiry_date: iso(30),
    states_available: "nationwide",
    application_url: "https://example.com/apply",
    source_url: "https://example.com/source",
    last_verified_date: iso(0),
    affiliate_url: null,
    offer_history: [],
    verification: null,
    status: "active",
    eligibility: null,
    ...o,
  };
}

/** Write records to a temp JSON store, point BONUS_DB_PATH at it, and import db.js fresh.
 *  Call once per test FILE (each file runs in its own process under `node --test`). */
export async function setupDb(records: Bonus[]): Promise<typeof import("../db.js")> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "benefits-test-"));
  const file = path.join(dir, "bonuses.json");
  fs.writeFileSync(file, JSON.stringify({ bonuses: records }));
  process.env.BONUS_DB_PATH = file;
  return import("../db.js");
}
