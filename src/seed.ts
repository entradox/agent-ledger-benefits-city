#!/usr/bin/env node
/**
 * Seed script: loads every *.json file in seed-data/ and upserts the
 * bonus records into the SQLite database. Re-runnable (upsert by id).
 *
 *   npm run seed
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb, upsertBonus } from "./db.js";
import type { Bonus, BonusType, SeedBonus } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SEED_DIR = path.join(ROOT, "seed-data");

function fail(msg: string): never {
  throw new Error(msg);
}

function validate(raw: SeedBonus, file: string, idx: number): Bonus {
  const where = `${file}[${idx}]`;
  if (!raw.id || typeof raw.id !== "string") fail(`${where}: missing string "id"`);
  if (!raw.bank_or_issuer || typeof raw.bank_or_issuer !== "string")
    fail(`${where}: missing string "bank_or_issuer"`);
  if (!raw.product_name || typeof raw.product_name !== "string")
    fail(`${where}: missing string "product_name"`);
  if (raw.bonus_type !== "bank_account" && raw.bonus_type !== "credit_card")
    fail(`${where}: "bonus_type" must be "bank_account" or "credit_card"`);
  if (typeof raw.bonus_amount_usd !== "number" || Number.isNaN(raw.bonus_amount_usd))
    fail(`${where}: "bonus_amount_usd" must be a number`);
  if (raw.expiry_date != null && !/^\d{4}-\d{2}-\d{2}$/.test(raw.expiry_date))
    fail(`${where}: "expiry_date" must be YYYY-MM-DD or null`);
  if (raw.last_verified_date != null && !/^\d{4}-\d{2}-\d{2}$/.test(raw.last_verified_date))
    fail(`${where}: "last_verified_date" must be YYYY-MM-DD or null`);

  return {
    id: raw.id,
    bank_or_issuer: raw.bank_or_issuer,
    product_name: raw.product_name,
    bonus_type: raw.bonus_type as BonusType,
    bonus_amount_usd: raw.bonus_amount_usd,
    bonus_points: raw.bonus_points ?? null,
    annual_fee_usd: raw.annual_fee_usd ?? null,
    requirements: Array.isArray(raw.requirements) ? raw.requirements : [],
    min_deposit_usd: raw.min_deposit_usd ?? null,
    direct_deposit_required: raw.direct_deposit_required === true,
    expiry_date: raw.expiry_date ?? null,
    states_available: raw.states_available ?? "nationwide",
    application_url: raw.application_url ?? null,
    source_url: raw.source_url ?? null,
    last_verified_date: raw.last_verified_date ?? null,
  };
}

function main(): void {
  getDb(); // creates DB + schema
  if (!fs.existsSync(SEED_DIR)) fail(`seed-data directory not found: ${SEED_DIR}`);
  const files = fs
    .readdirSync(SEED_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (files.length === 0) fail(`no seed JSON files in ${SEED_DIR}`);

  let total = 0;
  for (const file of files) {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(SEED_DIR, file), "utf8"));
    if (!Array.isArray(parsed)) fail(`${file}: expected a top-level JSON array`);
    let n = 0;
    for (let i = 0; i < parsed.length; i++) {
      upsertBonus(validate(parsed[i] as SeedBonus, file, i));
      n++;
    }
    total += n;
    console.log(`seeded ${n} bonus(es) from ${file}`);
  }
  console.log(`done: ${total} bonus(es) in database`);
}

main();
