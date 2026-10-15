import test from "node:test";
import assert from "node:assert/strict";
import { iso, makeBonus, setupDb } from "./helpers.js";

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";

/**
 * The whole point of the balance-transfer axis.
 *
 * A balance-transfer card carries no signup bonus by design. On a catalogue that ranks by bonus
 * amount, a $0 record sorts below every card that has one — forever — which is why this category
 * was invisible rather than merely missing. Here the ZERO-bonus card with the longer stated intro
 * window must rank ABOVE the card carrying a $250 bonus and a shorter window.
 *
 * If this test ever inverts, the axis has silently reverted to bonus ranking and the page is
 * publishing a claim about its own ordering that is not true.
 */
const db = await setupDb([
  makeBonus({
    id: "bt-long",
    bank_or_issuer: "Wells Fargo",
    product_name: "Reflect",
    bonus_type: "credit_card",
    bonus_amount_usd: 0,
    bt_intro_apr_pct: 0,
    bt_intro_months: 21,
    bt_fee_pct: 3,
    bt_fee_min_usd: 5,
    expiry_date: null,
  }),
  makeBonus({
    id: "bt-short",
    bank_or_issuer: "Citi",
    product_name: "Diamond Preferred",
    bonus_type: "credit_card",
    bonus_amount_usd: 250,
    bt_intro_apr_pct: 0,
    bt_intro_months: 12,
    bt_fee_pct: 5,
    bt_fee_min_usd: 5,
    expiry_date: null,
  }),
  makeBonus({
    id: "bt-nofee",
    bank_or_issuer: "Bank X",
    product_name: "No-fee transfer",
    bonus_type: "credit_card",
    bonus_amount_usd: 0,
    bt_intro_apr_pct: 0,
    bt_intro_months: 12,
    bt_fee_pct: 0,
    bt_fee_min_usd: null,
    expiry_date: null,
  }),
  makeBonus({
    id: "bt-unstated-fee",
    bank_or_issuer: "Bank Y",
    product_name: "Unstated transfer fee",
    bonus_type: "credit_card",
    bonus_amount_usd: 0,
    bt_intro_apr_pct: 0,
    bt_intro_months: 12,
    bt_fee_pct: null,
    bt_fee_min_usd: null,
    expiry_date: null,
  }),
  makeBonus({
    id: "premium-only",
    bank_or_issuer: "Amex",
    product_name: "Platinum",
    bonus_type: "credit_card",
    bonus_amount_usd: 2000,
    expiry_date: iso(300),
  }),
]);

const seo = await import("../seo.js");
const pages = await import("../seo-pages.js");
const { toPublic } = await import("../links.js");
const { loadOfferSchema, validateJson } = await import("./schema-validator.js");

const ctx = { basePath: "/benefits", publicUrl: "https://aiagentscity.com/benefits" };

test("a $0-bonus card with the longer intro window outranks a $250-bonus card with a shorter one", () => {
  const rows = seo.bestOffers("balance-transfer")!;
  assert.deepEqual(
    rows.map((b) => b.id),
    ["bt-long", "bt-nofee", "bt-short", "bt-unstated-fee"],
    "longest stated intro window first; then the cheaper transfer fee; an unstated fee sorts last",
  );
  // the card that wins carries no signup bonus at all — that is the entire point
  assert.equal(rows[0].bonus_amount_usd, 0);
  assert.ok(rows.some((b) => b.bonus_amount_usd === 250));
});

test("on the bonus axis the same zero-bonus card sorts below the one it beats here", () => {
  const byBonus = seo.bestOffers("credit-card")!;
  const iLong = byBonus.findIndex((b) => b.id === "bt-long");
  const iShort = byBonus.findIndex((b) => b.id === "bt-short");
  assert.ok(iLong >= 0 && iShort >= 0, "both cards are served");
  assert.ok(
    iLong > iShort,
    "the 21-month card sorts BELOW the 12-month card on the bonus axis — proof the category needed its own axis, not just more records",
  );
});

test("a card with no stated balance-transfer terms is not eligible for the balance-transfer page", () => {
  const rows = seo.bestOffers("balance-transfer")!;
  assert.ok(!rows.some((b) => b.id === "premium-only"), "a premium-rewards card with only a bonus must not appear");
});

test("the balance-transfer page states its own ranking basis and never claims the bonus ranking", () => {
  const bt = pages.bestPage(ctx, "balance-transfer");
  assert.ok(bt, "the page exists when at least one record states an intro window");
  assert.ok(bt!.includes("balance transfers"));
  assert.ok(
    !bt!.includes("Ranked by stated bonus amount"),
    "the bonus ranking statement must not appear on a page that does not rank by bonus amount",
  );
  // and the assertion is not vacuous: the bonus-ranked page really does carry that wording
  const cc = pages.bestPage(ctx, "credit-card")!;
  assert.ok(cc.includes("Ranked by stated bonus amount"));
});

test("a transfer card carrying the four new fields round-trips through toPublic and passes the contract schema", () => {
  const served = toPublic(seo.bestOffers("balance-transfer")![0]);
  assert.equal(served.bt_intro_months, 21);
  assert.equal(served.bt_intro_apr_pct, 0);
  assert.equal(served.bt_fee_pct, 3);
  assert.equal(served.bt_fee_min_usd, 5);
  assert.deepEqual(validateJson(served, loadOfferSchema()), []);
});

test("the null-means-unstated rule holds: 0 and null are not the same value", () => {
  const rows = seo.bestOffers("balance-transfer")!;
  const noFee = toPublic(rows.find((b) => b.id === "bt-nofee")!);
  const unstated = toPublic(rows.find((b) => b.id === "bt-unstated-fee")!);
  assert.equal(noFee.bt_fee_pct, 0, "the issuer states a 0% transfer fee — a real, published fact");
  assert.equal(unstated.bt_fee_pct, null, "the issuer states none — unknown, not zero");
  // and the axis treats them differently, cheapest-first with unknown last
  assert.ok(rows.findIndex((b) => b.id === "bt-nofee") < rows.findIndex((b) => b.id === "bt-unstated-fee"));
});

test("an undeclared field is still rejected by the contract schema", () => {
  const served = toPublic(seo.bestOffers("balance-transfer")![0]) as Record<string, unknown>;
  const errors = validateJson({ ...served, debt_score: 7 }, loadOfferSchema());
  assert.ok(
    errors.some((e) => e.path === "offer.debt_score" && /undeclared property/.test(e.message)),
    `adding balance-transfer fields must not open the schema to arbitrary ones, got: ${JSON.stringify(errors)}`,
  );
});

test("the balance-transfer page is listed in seoPaths and the sitemap when it has records", () => {
  assert.ok(seo.seoPaths().includes("/best/balance-transfer"));
});
