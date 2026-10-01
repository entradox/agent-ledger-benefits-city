import test from "node:test";
import assert from "node:assert/strict";
import { iso, makeBonus, setupDb } from "./helpers.js";

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";
const db = await setupDb([
  makeBonus({ id: "chase-a", bank_or_issuer: "Chase", product_name: "Total Checking", bonus_amount_usd: 400, expiry_date: iso(10) }),
  makeBonus({ id: "chase-b", bank_or_issuer: "Chase", product_name: "Freedom Flex", bonus_type: "credit_card", bonus_amount_usd: 250, expiry_date: null }),
  makeBonus({ id: "boa-a", bank_or_issuer: "Bank of America", product_name: "Advantage Plus", bonus_amount_usd: 300, expiry_date: iso(100) }),
  makeBonus({ id: "truist-a", bank_or_issuer: "Truist", product_name: "One Checking", bonus_amount_usd: 500, states_available: ["TX", "FL"], expiry_date: iso(200) }),
  makeBonus({ id: "tx-only", bank_or_issuer: "Lone Star CU", product_name: "Checking", bonus_amount_usd: 150, states_available: ["TX"], expiry_date: iso(50) }),
  makeBonus({ id: "barc-a", bank_or_issuer: "Barclays", product_name: "Tiered Savings", bonus_type: "savings", bonus_amount_usd: 200, expiry_date: iso(25) }),
  makeBonus({ id: "evil-a", bank_or_issuer: "Evil </script><b>Bank", product_name: "X</script>", bonus_amount_usd: 100, expiry_date: iso(60) }),
  makeBonus({ id: "amex-a", bank_or_issuer: "Amex", product_name: "Platinum", bonus_type: "credit_card", bonus_amount_usd: 2000, expiry_date: iso(300) }),
  makeBonus({ id: "dead-a", bank_or_issuer: "Deadbank", product_name: "Gone", expiry_date: iso(-5) }),
]);
const seo = await import("../seo.js");
const pages = await import("../seo-pages.js");
const site = await import("../site.js");
const ctx = { basePath: "/benefits", publicUrl: "https://aiagentscity.com/benefits" };

const ldBlocks = (html: string): any[] =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));

test("slugify is stable and URL-safe", () => {
  assert.equal(seo.slugify("Bank of America"), "bank-of-america");
  assert.equal(seo.slugify("M&T Bank"), "m-t-bank");
  assert.equal(seo.slugify("  Chase  "), "chase");
  assert.equal(seo.slugify("Evil </script><b>Bank"), "evil-script-b-bank");
});

test("issuer groups: served offers only, grouped by issuer, sorted by name", () => {
  const g = seo.issuerGroups();
  assert.deepEqual(g.map((x) => x.slug), ["amex", "bank-of-america", "barclays", "chase", "evil-script-b-bank", "lone-star-cu", "truist"]);
  assert.equal(seo.issuerBySlug("chase")!.offers.length, 2);
  assert.equal(seo.issuerBySlug("deadbank"), null); // expired-only issuer has no page
  assert.equal(seo.issuerBySlug("nope"), null);
});

test("state pages exist ONLY for states with a regional offer (no duplicate nationwide pages)", () => {
  assert.deepEqual(seo.regionalStates().map((s) => s.code).sort(), ["FL", "TX"]);
  const tx = seo.stateOffers("tx")!;
  assert.deepEqual(tx.regional.map((b) => b.id), ["truist-a", "tx-only"]);
  assert.ok(tx.nationwide.length >= 3);
  assert.equal(seo.stateOffers("CA"), null);
  assert.equal(seo.stateOffers("ZZ"), null);
});

test("best-of pages: known types only, non-empty only, value descending", () => {
  assert.deepEqual(seo.bestOffers("savings")!.map((b) => b.id), ["barc-a"]);
  assert.equal(seo.bestOffers("bank-account")![0].id, "truist-a");
  assert.equal(seo.bestOffers("crypto"), null);
});

test("seoPaths lists exactly the pages that really exist (and no empty ones)", () => {
  const paths = seo.seoPaths();
  for (const p of ["/banks", "/banks/chase", "/states", "/states/tx", "/best/bank-account", "/best/credit-card", "/best/savings", "/expiring-soon"])
    assert.ok(paths.includes(p), p);
  assert.ok(!paths.includes("/banks/deadbank") && !paths.includes("/states/ca"));
  assert.ok(!paths.includes("/states/fl"), "FL has one regional offer: its page exists for users but is not advertised to search engines");
  assert.equal(new Set(paths).size, paths.length);
});

test("pages: unique titles, real content, links to offers, honest data-date, JSON-LD parses", () => {
  const titles = new Set<string>();
  const render: [string, string | null][] = [
    ["banks", pages.banksIndexPage(ctx)], ["chase", pages.issuerPage(ctx, "chase")], ["boa", pages.issuerPage(ctx, "bank-of-america")],
    ["states", pages.statesIndexPage(ctx)], ["tx", pages.statePage(ctx, "tx")], ["best-bank", pages.bestPage(ctx, "bank-account")],
    ["best-sav", pages.bestPage(ctx, "savings")], ["expiring", pages.expiringPage(ctx)],
  ];
  for (const [name, html] of render) {
    assert.ok(html, name);
    const t = html!.match(/<title>([^<]*)<\/title>/)![1];
    assert.ok(!titles.has(t), `duplicate title: ${t}`);
    titles.add(t);
    assert.match(html!, /<h1>/);
    assert.ok(html!.includes("<link rel=\"canonical\""), name);
    assert.ok(ldBlocks(html!).length >= 1, `${name} json-ld`);
  }
  const chase = pages.issuerPage(ctx, "chase")!;
  assert.ok(chase.includes("/benefits/bonuses/chase-a") && chase.includes("/benefits/bonuses/chase-b"));
  assert.match(chase, /2 (current )?offers?/i);
  const list = ldBlocks(chase).find((b) => b["@type"] === "ItemList");
  assert.equal(list.numberOfItems, 2);
  assert.ok(ldBlocks(chase).some((b) => b["@type"] === "BreadcrumbList"));
  assert.equal(pages.issuerPage(ctx, "nope"), null);
  assert.equal(pages.statePage(ctx, "ca"), null);
  assert.equal(pages.bestPage(ctx, "crypto"), null);
});

test("expiring page lists only offers ending within 30 days, soonest first", () => {
  const html = pages.expiringPage(ctx)!;
  const iChase = html.indexOf("chase-a"), iBarc = html.indexOf("barc-a");
  assert.ok(iChase > 0 && iBarc > 0);
  assert.ok(iChase < iBarc, "10 days before 25 days");
  assert.ok(!html.includes("truist-a")); // 200 days out
});

test("JSON-LD cannot be broken out of by hostile record text; HTML is escaped", () => {
  const html = pages.issuerPage(ctx, "evil-script-b-bank")!;
  assert.ok(!html.includes("</script><b>"));
  assert.ok(ldBlocks(html).length >= 1); // still valid JSON after escaping
  assert.ok(!/<b>Bank/.test(html));
});

test("sitemap lists every real SEO page", () => {
  const sm = site.sitemapText(ctx);
  for (const p of seo.seoPaths()) assert.ok(sm.includes(`${ctx.publicUrl}${p}`), p);
});

test("the stated 'highest' is the real maximum on the page, not just the first-listed offer (state page lists regional first)", () => {
  // Re-seed the store: regional Truist $500 is listed first, a nationwide Amex $2,000 is higher.
  const html = pages.statePage(ctx, "tx")!;
  assert.match(html, /the highest is \$2,000 \(Amex Platinum/);
  assert.doesNotMatch(html, /the highest is \$500/);
});

test("Turing I1: two DIFFERENT issuers that slugify the same get distinct pages with correct names (no silent merge)", async () => {
  db.upsertBonus(makeBonus({ id: "mt-a", bank_or_issuer: "M&T Bank", product_name: "MyChoice", expiry_date: iso(30) }));
  db.upsertBonus(makeBonus({ id: "mt-b", bank_or_issuer: "M T Bank", product_name: "Other", expiry_date: iso(30) }));
  const groups = seo.issuerGroups().filter((g) => g.slug.startsWith("m-t-bank"));
  assert.equal(groups.length, 2);
  assert.equal(new Set(groups.map((g) => g.slug)).size, 2);
  const names = groups.map((g) => g.name).sort();
  assert.deepEqual(names, ["M T Bank", "M&T Bank"]);
  for (const g of groups) assert.ok(g.offers.every((o) => o.bank_or_issuer === g.name), `page ${g.slug} must only list ${g.name}`);
  db.removeBonus("mt-a"); db.removeBonus("mt-b");
});

test("Turing M1: a duplicated state code on one offer lists it once", () => {
  db.upsertBonus(makeBonus({ id: "dup-ny", bank_or_issuer: "Dupbank", states_available: ["NY", "NY", "ny"], expiry_date: iso(30) }));
  const ny = seo.stateOffers("ny")!;
  assert.equal(ny.regional.filter((b) => b.id === "dup-ny").length, 1);
  db.removeBonus("dup-ny");
});

test("Morgan C2: best-of pages say 'Highest', state the ranking basis and carry the affiliate disclosure on the page itself", () => {
  const html = pages.bestPage(ctx, "bank-account")!;
  assert.match(html, /<title>Highest bank account bonuses right now/);
  assert.match(html, /<h1>Highest-value bank account bonuses right now<\/h1>/);
  assert.doesNotMatch(html, /<h1>Best /);
  assert.match(html, /ranked by (stated )?bonus (value|amount)/i);
  assert.match(html, /earn us nothing|affiliate link/i); // disclosureShort on the ranking page itself
});

test("Morgan C6: an issuer page whose top offer is a card keeps the 'estimated value' qualifier in the meta description", () => {
  const html = pages.issuerPage(ctx, "amex")!;
  const desc = html.match(/<meta name="description" content="([^"]*)"/)![1];
  assert.match(desc, /estimated value/i);
});

test("duplicate-content guard: a state page is indexable only with >=2 regional offers AND a regional set no other state shares", () => {
  const idx = seo.indexableStates().map((s) => s.code);
  assert.deepEqual(idx, ["TX"]);
  const tx = pages.statePage(ctx, "tx")!;
  assert.doesNotMatch(tx, /<meta name="robots"/);
  const fl = pages.statePage(ctx, "fl")!; // exists for users...
  assert.match(fl, /<meta name="robots" content="noindex,follow">/); // ...but is kept out of the index
  assert.ok(!seo.seoPaths().includes("/states/fl"));
  assert.ok(seo.seoPaths().includes("/states")); // hub advertised because at least one state page is indexable
});

test("zero-offer state of the world: no empty index pages are advertised", async () => {
  for (const b of db.allRecords()) db.removeBonus(b.id);
  assert.deepEqual(seo.seoPaths(), []);
  assert.equal(pages.expiringPage(ctx), null);
  assert.equal(pages.bestPage(ctx, "savings"), null);
});
