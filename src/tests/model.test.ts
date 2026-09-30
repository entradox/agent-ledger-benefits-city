import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { iso, makeBonus, setupDb } from "./helpers.js";

const legacy = {
  // a record in the OLD seed shape: none of the v2 fields
  id: "legacy-old",
  bank_or_issuer: "Old Bank",
  product_name: "Old Checking",
  bonus_type: "bank_account",
  bonus_amount_usd: 100,
  bonus_points: null,
  annual_fee_usd: null,
  requirements: [],
  min_deposit_usd: null,
  direct_deposit_required: false,
  expiry_date: null,
  states_available: "nationwide",
  application_url: null,
  source_url: null,
  last_verified_date: null,
} as unknown as ReturnType<typeof makeBonus>;

const records = [
  makeBonus({ id: "future", bonus_amount_usd: 500, expiry_date: iso(10) }),
  makeBonus({ id: "expires-today", bonus_amount_usd: 400, expiry_date: iso(0) }),
  makeBonus({ id: "expired-yesterday", bonus_amount_usd: 900, expiry_date: iso(-1) }),
  makeBonus({ id: "status-expired", bonus_amount_usd: 800, expiry_date: iso(20), status: "expired" }),
  makeBonus({ id: "sav", bonus_type: "savings", bonus_amount_usd: 200, expiry_date: iso(40) }),
  legacy,
];

const db = await setupDb(records);

test("expired (by date or status) is never served anywhere; today still served", async () => {
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
  assert.deepEqual(ids(db.listAll()).sort(), ["expires-today", "future", "legacy-old", "sav"]);
  assert.ok(!ids(db.searchBonuses({ limit: 100 })).includes("expired-yesterday"));
  assert.ok(!ids(db.searchBonuses({ limit: 100 })).includes("status-expired"));
  assert.equal(db.getBonusById("expired-yesterday"), undefined);
  assert.equal(db.getBonusById("status-expired"), undefined);
  assert.ok(db.getBonusById("expires-today"));
  assert.ok(!ids(db.expiringSoon(365)).includes("status-expired"));
  const { getStats } = await import("../stats.js");
  const s = getStats();
  assert.equal(s.total_offers, 4);
  assert.equal(s.savings_offers, 1);
});

test("legacy record (no v2 fields) loads with defaults and is served", () => {
  const b = db.getBonusById("legacy-old");
  assert.ok(b);
  assert.equal(b!.affiliate_url, null);
  assert.deepEqual(b!.offer_history, []);
  assert.equal(b!.verification, null);
  assert.equal(b!.status, "active");
  assert.equal(b!.eligibility, null);
});

test("savings is a filterable type; sort is value desc", () => {
  assert.deepEqual(db.searchBonuses({ bonus_type: "savings" }).map((b) => b.id), ["sav"]);
  const top = db.searchBonuses({ limit: 100 }).map((b) => b.id);
  assert.equal(top[0], "future");
});

test("removeBonus deletes and reports", () => {
  db.upsertBonus(makeBonus({ id: "tmp-remove" }));
  assert.equal(db.removeBonus("tmp-remove"), true);
  assert.equal(db.removeBonus("tmp-remove"), false);
  assert.equal(db.allRecords().some((b) => b.id === "tmp-remove"), false);
});

test("syncSeed upserts and PRUNES ids no longer in seed files (rename leaves no ghost)", async () => {
  const { syncSeed, validate } = await import("../seed.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seed-"));
  const rec = (id: string) => ({
    id,
    bank_or_issuer: "Chase",
    product_name: "Total Checking",
    bonus_type: "bank_account",
    bonus_amount_usd: 400,
    expiry_date: iso(20),
    application_url: "https://chase.com/x",
  });
  fs.writeFileSync(path.join(dir, "a.json"), JSON.stringify([rec("chase-total-checking-300")]));
  syncSeed(dir);
  assert.ok(db.getBonusById("chase-total-checking-300"));
  // rename: old id disappears from the seed
  fs.writeFileSync(path.join(dir, "a.json"), JSON.stringify([rec("chase-total-checking-400")]));
  const r = syncSeed(dir);
  assert.ok(r.removed.includes("chase-total-checking-300"));
  assert.equal(db.getBonusById("chase-total-checking-300"), undefined);
  assert.ok(db.getBonusById("chase-total-checking-400"));
  // bad input is rejected loudly
  assert.throws(() => validate({ ...rec("x"), application_url: "javascript:alert(1)" } as never, "t", 0), /http\(s\)/);
  assert.throws(() => validate({ ...rec("x"), bonus_type: "crypto" } as never, "t", 0), /bonus_type/);
});
