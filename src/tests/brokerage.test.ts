import test from "node:test";
import assert from "node:assert/strict";
import { iso, makeBonus, setupDb } from "./helpers.js";

const db = await setupDb([
  makeBonus({ id: "bank-1", bonus_amount_usd: 300 }),
  makeBonus({
    id: "broker-1",
    bank_or_issuer: "Test Brokerage",
    product_name: "Brokerage Referral Offer",
    bonus_type: "brokerage",
    bonus_amount_usd: 100,
    bonus_max_usd: 1000,
    expiry_date: iso(30),
  }),
]);

test("brokerage is a filterable type through the store", () => {
  assert.deepEqual(
    db.searchBonuses({ bonus_type: "brokerage" }).map((b) => b.id),
    ["broker-1"],
  );
});

test("stats exposes brokerage_offers", async () => {
  const { getStats } = await import("../stats.js");
  const s = getStats();
  assert.equal(s.brokerage_offers, 1);
  assert.equal(s.total_offers, 2);
});

test("insights by_type includes a brokerage bucket", async () => {
  const { insights } = await import("../insights.js");
  const i = insights() as { by_type: { brokerage: { count: number; highest_offer_id: string | null } } };
  assert.equal(i.by_type.brokerage.count, 1);
  assert.equal(i.by_type.brokerage.highest_offer_id, "broker-1");
});

test("seed validator accepts a brokerage record", async () => {
  const { validate } = await import("../seed.js");
  const ok = validate(
    {
      id: "b",
      bank_or_issuer: "X",
      product_name: "P",
      bonus_type: "brokerage",
      bonus_amount_usd: 100,
      application_url: "https://example.com/a",
    } as never,
    "t",
    0,
  );
  assert.equal(ok.bonus_type, "brokerage");
});

test("browse page groups brokerage into its own category section", async () => {
  const { browsePage, detailPage } = await import("../site.js");
  const ctx = { basePath: "/benefits", publicUrl: "https://aiagentscity.com/benefits" };
  const html = browsePage(ctx, { type: "", state: "", min: "", dd: "", q: "", sort: "value" });
  assert.match(html, /id="cat-brokerage"/);
  assert.match(html, />Brokerage</);
  const filtered = browsePage(ctx, { type: "brokerage", state: "", min: "", dd: "", q: "", sort: "value" });
  assert.match(filtered, /broker-1/);
  assert.ok(!filtered.includes("bank-1"));
  const detail = detailPage(ctx, "broker-1");
  assert.ok(detail);
  assert.match(detail!, /Brokerage account bonus/);
});
