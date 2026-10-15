import test from "node:test";
import assert from "node:assert/strict";
import { iso, makeBonus, setupDb } from "./helpers.js";

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";

/**
 * The other half of the balance-transfer axis: when no record states an intro window on transferred
 * balances, the page must not exist at all.
 *
 * Every /best page in this catalogue exists only when it has at least one served offer — a page
 * standing on nothing is a thin page, and the catalogue's own published rule is that it does not
 * publish those. This file runs against a store with premium-rewards cards only, which is exactly
 * the state the live catalogue was in before this axis was built.
 */
const db = await setupDb([
  makeBonus({
    id: "premium-only",
    bank_or_issuer: "Amex",
    product_name: "Platinum",
    bonus_type: "credit_card",
    bonus_amount_usd: 2000,
    expiry_date: iso(300),
  }),
  makeBonus({
    id: "cashback-only",
    bank_or_issuer: "Chase",
    product_name: "Freedom Flex",
    bonus_type: "credit_card",
    bonus_amount_usd: 250,
    expiry_date: null,
  }),
]);

const seo = await import("../seo.js");
const pages = await import("../seo-pages.js");

const ctx = { basePath: "/benefits", publicUrl: "https://aiagentscity.com/benefits" };

test("with no balance-transfer record, the axis returns nothing", () => {
  assert.equal(seo.bestOffers("balance-transfer"), null);
});

test("with no balance-transfer record, the route does not exist and is not advertised", () => {
  assert.equal(pages.bestPage(ctx, "balance-transfer"), null, "no page is built, so the route 404s");
  assert.ok(
    !seo.seoPaths().includes("/best/balance-transfer"),
    "an empty balance-transfer page must stay out of the sitemap",
  );
});

test("the catalogue is non-empty otherwise, so the two checks above are not vacuous", () => {
  assert.ok(seo.bestOffers("credit-card")!.length >= 2);
  assert.ok(seo.seoPaths().includes("/best/credit-card"));
});
