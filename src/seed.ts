#!/usr/bin/env node
/**
 * Seed script: seed-data/*.json is the SINGLE SOURCE OF TRUTH. Every record is validated and
 * upserted by id, and any stored id that is no longer in the seed files is REMOVED (so a
 * renamed or deleted offer cannot linger in the served store).
 *
 *   npm run seed
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { allRecords, getDb, removeBonus, upsertBonus } from "./db.js";
import type { Bonus, BonusStatus, BonusType, SeedBonus } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SEED_DIR = path.join(ROOT, "seed-data");

const TYPES: BonusType[] = ["bank_account", "credit_card", "savings"];
const STATUSES: BonusStatus[] = ["active", "expired", "needs_review"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function fail(msg: string): never {
  throw new Error(msg);
}

function httpUrlOrNull(v: unknown, where: string, field: string): string | null {
  if (v == null) return null;
  try {
    const u = new URL(String(v));
    if (u.protocol === "http:" || u.protocol === "https:") return String(v);
  } catch {
    /* fall through */
  }
  return fail(`${where}: "${field}" must be an http(s) URL or null`);
}

export function validate(raw: SeedBonus, file: string, idx: number): Bonus {
  const where = `${file}[${idx}]`;
  if (!raw.id || typeof raw.id !== "string") fail(`${where}: missing string "id"`);
  if (!raw.bank_or_issuer || typeof raw.bank_or_issuer !== "string")
    fail(`${where}: missing string "bank_or_issuer"`);
  if (!raw.product_name || typeof raw.product_name !== "string")
    fail(`${where}: missing string "product_name"`);
  if (!TYPES.includes(raw.bonus_type as BonusType))
    fail(`${where}: "bonus_type" must be one of ${TYPES.join(", ")}`);
  if (typeof raw.bonus_amount_usd !== "number" || Number.isNaN(raw.bonus_amount_usd))
    fail(`${where}: "bonus_amount_usd" must be a number`);
  if (raw.expiry_date != null && !DATE.test(raw.expiry_date))
    fail(`${where}: "expiry_date" must be YYYY-MM-DD or null`);
  if (raw.last_verified_date != null && !DATE.test(raw.last_verified_date))
    fail(`${where}: "last_verified_date" must be YYYY-MM-DD or null`);
  if (raw.status != null && !STATUSES.includes(raw.status))
    fail(`${where}: "status" must be one of ${STATUSES.join(", ")}`);
  if (raw.verification != null) {
    const v = raw.verification;
    if (v.method !== "issuer_page" && v.method !== "aggregator_consensus")
      fail(`${where}: "verification.method" must be issuer_page or aggregator_consensus`);
    if (!DATE.test(String(v.verified_at))) fail(`${where}: "verification.verified_at" must be YYYY-MM-DD`);
    if (!Array.isArray(v.sources)) fail(`${where}: "verification.sources" must be an array`);
  }
  if (raw.offer_history != null && !Array.isArray(raw.offer_history))
    fail(`${where}: "offer_history" must be an array`);

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
    application_url: httpUrlOrNull(raw.application_url, where, "application_url"),
    affiliate_url: httpUrlOrNull(raw.affiliate_url, where, "affiliate_url"),
    source_url: httpUrlOrNull(raw.source_url, where, "source_url"),
    last_verified_date: raw.last_verified_date ?? null,
    offer_history: raw.offer_history ?? [],
    verification: raw.verification ?? null,
    status: raw.status ?? "active",
    eligibility: raw.eligibility ?? null,
  };
}

export function syncSeed(
  seedDir: string,
  opts: { allowMassPrune?: boolean } = {},
): { upserted: number; removed: string[] } {
  getDb(); // creates DB
  const priorCount = allRecords().length;
  if (!fs.existsSync(seedDir)) fail(`seed-data directory not found: ${seedDir}`);
  const files = fs
    .readdirSync(seedDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (files.length === 0) fail(`no seed JSON files in ${seedDir}`);

  const seen = new Set<string>();
  let upserted = 0;
  for (const file of files) {
    const parsed: unknown = JSON.parse(fs.readFileSync(path.join(seedDir, file), "utf8"));
    if (!Array.isArray(parsed)) fail(`${file}: expected a top-level JSON array`);
    for (let i = 0; i < parsed.length; i++) {
      const rec = validate(parsed[i] as SeedBonus, file, i);
      upsertBonus(rec);
      seen.add(rec.id);
      upserted++;
    }
    console.log(`seeded ${parsed.length} bonus(es) from ${file}`);
  }
  // Guard the destructive step: a renamed/emptied/partial seed file must never silently wipe the
  // served store. Pruning a few stale ids is normal; a large share (or everything) is not.
  if (seen.size === 0) fail("refusing to prune: the seed files contain no records");
  const stale = allRecords().filter((b) => !seen.has(b.id));
  const limit = Math.max(5, Math.floor(priorCount * 0.2));
  if (stale.length > limit && !opts.allowMassPrune)
    fail(
      `refusing mass prune: ${stale.length} of ${priorCount} stored records are absent from the seed files ` +
        `(limit ${limit}). If intended, re-run with --allow-mass-prune.`,
    );
  const removed: string[] = [];
  for (const b of stale) {
    removeBonus(b.id);
    removed.push(b.id);
  }
  if (removed.length) console.log(`pruned ${removed.length} stale id(s): ${removed.join(", ")}`);
  console.log(`done: ${upserted} bonus(es) in database`);
  return { upserted, removed };
}

// Run only when executed directly (prestart: `node dist/seed.js`), not when imported by tests.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncSeed(SEED_DIR, { allowMassPrune: process.argv.includes("--allow-mass-prune") });
}
