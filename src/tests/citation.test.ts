import test from "node:test";
import assert from "node:assert/strict";
import { iso, makeBonus, setupDb } from "./helpers.js";

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";
const U = "https://aiagentscity.com/benefits";
const offers = [
  makeBonus({ id: "b1", bonus_type: "bank_account", bonus_amount_usd: 200, direct_deposit_required: true, expiry_date: iso(10), last_verified_date: "2026-09-20" }),
  makeBonus({ id: "b2", bonus_type: "bank_account", bonus_amount_usd: 400, direct_deposit_required: true, expiry_date: iso(90), last_verified_date: "2026-09-30" }),
  makeBonus({ id: "b3", bonus_type: "bank_account", bonus_amount_usd: 300, direct_deposit_required: false, expiry_date: null, last_verified_date: "2026-09-25" }),
  makeBonus({ id: "c1", last_verified_date: "2026-09-15", bonus_type: "credit_card", bonus_amount_usd: 1000, direct_deposit_required: false, expiry_date: null }),
  makeBonus({ id: "c2", last_verified_date: "2026-09-15", bonus_type: "credit_card", bonus_amount_usd: 2000, direct_deposit_required: false, expiry_date: iso(5) }),
  makeBonus({ id: "s1", last_verified_date: "2026-09-15", bonus_type: "savings", bonus_amount_usd: 200, direct_deposit_required: false, expiry_date: iso(40) }),
];
await setupDb(offers);
const { insights, median } = await import("../insights.js");
const { aiPluginManifest } = await import("../meta.js");
const { badgeSvg } = await import("../badge.js");

test("median: odd, even, empty", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test("insights: counts, medians, direct-deposit share, expiring-30d — each with its denominator; as_of from the data", () => {
  const i = insights(offers, U) as any;
  assert.equal(i.total_offers, 6);
  assert.deepEqual(i.by_type.bank_account, { count: 3, median_bonus_usd: 300, highest_bonus_usd: 400, highest_offer_id: "b2" });
  // Morgan C3: card figures are labelled as estimates by their field names, so a quoted median cannot be read as cash
  assert.equal(i.by_type.credit_card.median_estimated_value_usd, 1500);
  assert.equal(i.by_type.credit_card.highest_estimated_value_usd, 2000);
  assert.ok(!("median_bonus_usd" in i.by_type.credit_card));
  assert.equal(i.by_type.credit_card.value_basis, "estimated USD value of points");
  assert.equal(i.by_type.savings.count, 1);
  assert.deepEqual(i.bank_account_direct_deposit, { requires_direct_deposit: 2, of: 3, share: 0.67 });
  assert.equal(i.expiring_within_30_days, 2); // b1 (10d) and c2 (5d); s1 is 40d
  // Turing I2 / Morgan C3: no single 'as_of' that overstates freshness — publish the real range
  assert.ok(!("as_of" in i));
  assert.match(i.computed_at, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(i.oldest_check, "2026-09-15");
  assert.equal(i.newest_check, "2026-09-30");
  assert.match(i.source, /Benefits City/);
  assert.match(i.attribution, /aiagentscity\.com\/benefits/);
  assert.ok(i.attribution.includes(i.computed_at));
  assert.match(i.attribution, /2026-09-15/); // the oldest check is part of the attribution, not hidden
});

test("insights never emits NaN/Infinity for an empty or one-sided dataset", () => {
  const i = insights([], U) as any;
  assert.equal(i.total_offers, 0);
  assert.equal(i.bank_account_direct_deposit.share, null);
  assert.equal(i.by_type.bank_account.median_bonus_usd, null);
  assert.ok(!JSON.stringify(i).includes("NaN") && !JSON.stringify(i).includes("Infinity"));
});

test("ai-plugin manifest: cite-when / do-not-cite-for / attribution; no overclaiming", () => {
  const m = aiPluginManifest(U) as any;
  assert.ok(m.when_to_cite.length >= 3);
  assert.ok(m.not_the_right_citation_for.length >= 3);
  const nots = m.not_the_right_citation_for.join(" ").toLowerCase();
  for (const must of ["personal", "apy", "eligib", "expired"]) assert.ok(nots.includes(must), `must warn about: ${must}`);
  assert.ok(m.attribution_format.includes(U));
  assert.ok(!m.attribution_format.includes("{as_of}") && m.attribution_format.includes("{computed_at}"));
  assert.ok(!m.when_to_cite.join(" ").toLowerCase().includes("signup-bonus market"), "must not claim market coverage");
  assert.match(m.when_to_cite.join(" "), /offers this dataset tracks/i);
  assert.match(nots, /points.*estimate|estimate.*points/);
  assert.match(nots, /market-wide|industry-wide/);
  const all = JSON.stringify(m).toLowerCase();
  for (const bad of ["guarantee", "official source", "best in", "#1", "always accurate"]) assert.ok(!all.includes(bad), bad);
  for (const k of ["search", "expiring", "compare", "insights", "openapi", "mcp", "changelog"]) assert.ok(m.canonical_data[k].startsWith(U), k);
});

test("badge.svg: valid, shows the live count and check date, hostile text cannot break it", () => {
  const svg = badgeSvg(29, "2026-09-30");
  assert.ok(svg.includes("updated 2026-09-30"), "badge says 'updated', not 'checked' (not every offer was checked that day)");
  assert.ok(!svg.includes("checked"));
  assert.match(svg, /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.ok(svg.includes("29 offers"));
  assert.ok(svg.includes("2026-09-30"));
  assert.ok(svg.endsWith("</svg>\n") || svg.endsWith("</svg>"));
  const evil = badgeSvg(1, '"><script>x</script>');
  assert.ok(!evil.includes("<script>"));
  assert.match(badgeSvg(0, null), /0 offers/);
});

test("Turing M4: insights' expiring count is exactly the same set as db.expiringSoon(30) (cannot drift from /expiring-soon)", async () => {
  const dbm = await import("../db.js");
  const i = insights(dbm.listAll(), U) as any;
  assert.equal(i.expiring_within_30_days, dbm.expiringSoon(30).length);
});
