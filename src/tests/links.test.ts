import test from "node:test";
import assert from "node:assert/strict";
import { iso, makeBonus, setupDb } from "./helpers.js";

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";
const base = [
  makeBonus({ id: "a", bonus_amount_usd: 500 }),
  makeBonus({ id: "b", bonus_amount_usd: 400 }),
  makeBonus({ id: "c", bonus_amount_usd: 400 }),
  makeBonus({ id: "d", bonus_amount_usd: 100 }),
];
const db = await setupDb(base);
const links = await import("../links.js");

test("resolveApplyUrl prefers a valid affiliate URL, falls back, and never returns junk schemes", () => {
  const aff = makeBonus({ affiliate_url: "https://partner.example/click?id=1" });
  assert.equal(links.resolveApplyUrl(aff), "https://partner.example/click?id=1");
  const junk = makeBonus({ affiliate_url: "javascript:alert(1)", application_url: "data:text/html,x", source_url: "https://ok.example/s" });
  assert.equal(links.resolveApplyUrl(junk), "https://ok.example/s");
  const none = makeBonus({ affiliate_url: null, application_url: null, source_url: null });
  assert.equal(links.resolveApplyUrl(none), null);
});

test("toPublic hides the raw affiliate URL and exposes our /go link + sponsored flag", () => {
  const p = links.toPublic(makeBonus({ id: "x", affiliate_url: "https://partner.example/click?id=1" }));
  assert.equal("affiliate_url" in p, false);
  assert.equal(p.sponsored, true);
  assert.equal(p.apply_url, "https://aiagentscity.com/benefits/go/x");
  assert.equal(p.disclosure_url, "https://aiagentscity.com/benefits/disclosure");
  const q = links.toPublic(makeBonus({ id: "y" }));
  assert.equal(q.sponsored, false);
  const none = links.toPublic(makeBonus({ id: "z", application_url: null, source_url: null }));
  assert.equal(none.apply_url, null);
});

test("ranking is independent of commission: attaching affiliate URLs never changes order", () => {
  const order = () => db.searchBonuses({ limit: 100 }).map((b) => b.id);
  const before = order();
  assert.deepEqual(before, ["a", "b", "c", "d"]); // ties (b,c) broken by id
  for (const id of ["d", "c"]) {
    const rec = db.getBonusById(id)!;
    db.upsertBonus({ ...rec, affiliate_url: `https://partner.example/${id}` });
  }
  assert.deepEqual(order(), before);
  assert.deepEqual(db.listAll().map((b) => b.id).sort(), ["a", "b", "c", "d"]);
});

test("disclosure wording flips when any affiliate link is live", () => {
  assert.equal(links.affiliateActive([makeBonus()]), false);
  assert.equal(links.affiliateActive([makeBonus({ affiliate_url: "https://p.example/1" })]), true);
  assert.match(links.disclosureShort(false), /earn us nothing/i);
  assert.match(links.disclosureShort(false), /bonus tracker/i); // no false "official pages only" claim
  assert.doesNotMatch(links.disclosureShort(false), /official pages/i);
  assert.match(links.disclosureShort(true), /commission/i);
  assert.match(links.disclosureShort(true), /never influence/i);
});

test("detail page marks sponsored links rel=sponsored", async () => {
  const { detailPage } = await import("../site.js");
  const ctx = { basePath: "/benefits", publicUrl: "https://aiagentscity.com/benefits" };
  db.upsertBonus(makeBonus({ id: "spons", affiliate_url: "https://partner.example/s", expiry_date: iso(5) }));
  db.upsertBonus(makeBonus({ id: "plain", expiry_date: iso(5) }));
  assert.match(detailPage(ctx, "spons")!, /rel="sponsored nofollow noopener"/);
  assert.doesNotMatch(detailPage(ctx, "plain")!, /rel="sponsored/);
});
