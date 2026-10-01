import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setupDb } from "./helpers.js";
import type { Bonus } from "../types.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SEED_FILES = ["bank-account-bonuses.json", "credit-card-bonuses.json", "savings-bonuses.json"];
const readSeed = (f: string): Record<string, unknown>[] =>
  JSON.parse(fs.readFileSync(path.join(ROOT, "seed-data", f), "utf8"));

const seed = SEED_FILES.flatMap(readSeed);
process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";
await setupDb(seed as unknown as Bonus[]);

const ctx = { basePath: "/benefits", publicUrl: "https://aiagentscity.com/benefits" };

// ---- Privacy + Terms are a hard requirement for email capture and affiliate applications, and a
// ---- reader has to be able to reach them from every page.
test("privacy and terms pages exist, are substantive, and are linked from the footer", async () => {
  const { privacyPage, termsPage, shell, aboutPage } = await import("../site.js");
  const privacy = privacyPage(ctx);
  const terms = termsPage(ctx);
  assert.match(privacy, /<h1>Privacy<\/h1>/);
  assert.match(terms, /<h1>Terms of use<\/h1>/);
  // Substantive, not stubs.
  assert.ok((privacy.match(/<h2>/g) ?? []).length >= 7, "privacy page is too thin to be a real policy");
  assert.ok((terms.match(/<h2>/g) ?? []).length >= 7, "terms page is too thin to be a real agreement");
  // The claims that matter, present in the policy.
  assert.match(privacy, /90 days/);
  assert.match(privacy, /Do Not Track/);
  assert.match(privacy, /double opt-in/i);
  assert.match(terms, /not financial advice/i);
  assert.match(terms, /issuer's own page before acting/i);
  // Reachable from the footer on every page.
  const footer = shell(ctx, "About", "d", aboutPage(ctx), "/about");
  assert.match(footer, /href="\/benefits\/privacy"/);
  assert.match(footer, /href="\/benefits\/terms"/);
});

test("sitemap advertises privacy and terms", async () => {
  const { sitemapText } = await import("../site.js");
  const xml = sitemapText(ctx);
  assert.match(xml, /<loc>https:\/\/aiagentscity\.com\/benefits\/privacy<\/loc>/);
  assert.match(xml, /<loc>https:\/\/aiagentscity\.com\/benefits\/terms<\/loc>/);
});

// The About page promises a verification cadence. On 2026-10-01 an audit found 20 of 34 records
// stale by 10+ days while that page read as though the feed were uniformly fresh.
test("the About page does not overstate the verification cadence", async () => {
  const { aboutPage } = await import("../site.js");
  const html = aboutPage(ctx);
  assert.doesNotMatch(
    html,
    /full feed on a rolling monthly cadence/i,
    "About claims a uniform cadence the data does not meet; point readers at last_verified_date",
  );
  assert.match(html, /last_verified_date/);
});

// ---- Data invariants. These are the defects the 2026-10-01 verification runs surfaced: the value we
// ---- rank and display must be the value a normal applicant actually receives.
test("no offer ranks on a top tier it cannot pay without extra conditions", () => {
  const byId = new Map(seed.map((r) => [r.id as string, r]));
  const assoc = byId.get("associated-bank-checking-600") as Record<string, unknown>;
  assert.ok(assoc, "associated-bank-checking-600 missing");
  // $600 requires a $10,000+ average daily balance; the direct-deposit action alone earns $300.
  assert.notEqual(
    assoc.bonus_amount_usd,
    600,
    "ranking on the top tier puts a $300 offer at the top of every 'biggest bonus' surface",
  );
  assert.equal(assoc.bonus_amount_usd, 300);
  assert.equal(assoc.bonus_max_usd, 600);
  assert.match((assoc.requirements as string[]).join(" "), /TOP TIER ONLY/);
});

test("no offer ranks on a targeted-only amount", () => {
  const byId = new Map(seed.map((r) => [r.id as string, r]));
  const ap = byId.get("amex-business-platinum-300k") as Record<string, unknown>;
  assert.ok(ap, "amex-business-platinum-300k missing");
  assert.equal(ap.bonus_points, 200000, "300k is a targeted/YMMV offer, not the public one");
  assert.equal(ap.bonus_amount_usd, 4000);
});

// A source_url is the product's core trust claim. Two records cited a page containing no offer terms
// at all, so the rule is: never cite a tracker article as a card's terms source.
test("no card cites a non-offer page as its terms source", () => {
  const banned = /awardwallet\.com\/news\/|financebuzz\.com|thepointsguy\.com\/credit-cards\/limited-time/;
  const cards = readSeed("credit-card-bonuses.json");
  for (const c of cards) {
    const src = String(c.source_url ?? "");
    assert.doesNotMatch(src, banned, `${c.id} cites a page that is not an offer terms page: ${src}`);
  }
});

test("every seed record carries the keys MCP declares required in outputSchema", () => {
  const required = ["bonus_points", "annual_fee_usd"];
  for (const f of SEED_FILES) {
    for (const r of readSeed(f)) {
      for (const k of required) {
        assert.ok(
          k in r,
          `${f}:${r.id} is missing "${k}" — MCP validation would fail the whole structured response`,
        );
      }
    }
  }
});

test("no offer claims a fixed dollar bonus where the issuer publishes none", () => {
  const byId = new Map(seed.map((r) => [r.id as string, r]));
  const d = byId.get("discover-it-cash-back-match") as Record<string, unknown>;
  // Discover pays an uncapped year-one match; the old $525 was a third-party average.
  assert.equal(d.bonus_amount_usd, 0);
  assert.match((d.requirements as string[]).join(" "), /UNCAPPED/);
});
