/**
 * D-1562 B2 offer grid — the tests the port shipped without.
 *
 * The merged B2 port (PR #10) changed zero test files, so nothing in the suite loaded the new
 * surface: "142/142 pass" was the pre-change count, not evidence about the port. These
 * assertions exercise the real render path (src/site.ts string templates over a seeded DB) and
 * the served font asset, and each one is written so it fails on the pre-fix tree — see the
 * close note on frame card D-1562 for the red run.
 */
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { makeBonus, setupDb } from "./helpers.js";

/* The fixture contains the trap on purpose: a consumer account whose REQUIREMENTS mention
 * "business days". Matching on requirements false-positived Truist and SoFi into Business in
 * the first pass; the shipped rule matches product_name only. Truist's first requirement is the
 * real string from seed-data/, 173 chars long, whose old 104-char slice landed INSIDE the word
 * "using" — that is the shipped defect, reproduced verbatim. */
const TRUIST_REQ = "New Truist personal checking clients only: open a new Truist One Checking (or Truist Marquee Checking) account from July 14, 2026 through February 2, 2027 using a promo code";
const TRUIST_REQ_2 = "Receive at least 2 qualifying direct deposits totaling $2,000 or more within 120 days of account opening";
const SOFI_REQ = "Set up a qualifying direct deposit of $250 or more within 30 business days of opening the account";

const RECORDS = [
  makeBonus({
    id: "truist-one-checking",
    bank_or_issuer: "Truist",
    product_name: "One Checking",
    bonus_type: "bank_account",
    bonus_amount_usd: 400,
    requirements: [
      TRUIST_REQ,
      TRUIST_REQ_2,
      // Not rendered (the card shows two) but present on the record — this is the string that
      // false-positived Truist into Business when the rule matched requirements instead of names.
      "Reward is deposited to the new checking account within 10 business days after the requirements are met and verified",
    ],
    source_url: "https://www.truist.com/checking/lp/promos/open-checking",
    last_verified_date: "2026-10-01",
  }),
  makeBonus({
    id: "sofi-checking-savings",
    bank_or_issuer: "SoFi",
    product_name: "Checking and Savings",
    bonus_type: "bank_account",
    bonus_amount_usd: 300,
    requirements: [SOFI_REQ, "Keep the account in good standing while the bonus is credited, usually within 14 business days"],
    source_url: "https://www.sofi.com/banking/",
    last_verified_date: "2026-09-28",
  }),
  makeBonus({
    id: "chase-ink-business-preferred",
    bank_or_issuer: "Chase",
    product_name: "Ink Business Preferred",
    bonus_type: "credit_card",
    bonus_amount_usd: 1000,
    requirements: ["Spend $8,000 on purchases in the first 3 months after account opening", "Pay the $95 annual fee"],
    source_url: "https://creditcards.chase.com/business-credit-cards/ink/business-preferred",
    last_verified_date: "2026-10-02",
  }),
  makeBonus({
    id: "bluevine-business-checking",
    bank_or_issuer: "Bluevine",
    product_name: "Business Checking",
    bonus_type: "bank_account",
    bonus_amount_usd: 200,
    requirements: ["Open a Bluevine Business Checking account", "Deposit $500 within 30 days"],
    source_url: "https://www.bluevine.com/business-checking",
    last_verified_date: "2026-09-30",
  }),
  makeBonus({
    id: "chase-sapphire-preferred",
    bank_or_issuer: "Chase",
    product_name: "Sapphire Preferred",
    bonus_type: "credit_card",
    bonus_amount_usd: 750,
    requirements: ["Spend $4,000 on purchases in the first 3 months", "Redeem through Chase Travel for 1.25x"],
    source_url: "https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred",
    last_verified_date: "2026-10-03",
  }),
  makeBonus({
    id: "citi-premier-savings",
    bank_or_issuer: "Citi",
    product_name: "Premier Savings",
    bonus_type: "savings",
    bonus_amount_usd: 150,
    requirements: ["Open a Citi Premier Savings account", "Deposit $25,000 within 30 days"],
    source_url: "https://www.citi.com/banking/savings-account",
    last_verified_date: "2026-09-25",
  }),
];

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";
await setupDb(RECORDS);
const ctx = { basePath: "/benefits", publicUrl: "https://aiagentscity.com/benefits" };
const { landingPage, browsePage, categoryOf } = await import("../site.js");
const home = landingPage(ctx);
const browse = browsePage(ctx, { type: "", state: "", min: "", dd: "", q: "", sort: "value" });

/* --- helpers over the rendered HTML --- */

/** Card markup only — the shell and chrome around the cards are not what these tests are about. */
const cards = (html: string) => [...html.matchAll(/<article class="offer">([\s\S]*?)<\/article>/g)].map((m) => m[1]);
const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
/** Section markup keyed by category, each cut at its own closing tag (no section nests another). */
const sectionsById = (html: string): Record<string, string> =>
  Object.fromEntries(
    [...html.matchAll(/<section class="offer-sec" id="cat-([a-z_]+)">([\s\S]*?)<\/section>/g)].map((m) => [m[1], m[2]]),
  );
const categoryCount = (html: string, key: string) =>
  Number((sectionsById(html)[key].match(/<span class="offer-count mono">(\d+) offer/) ?? [])[1]);

test("categoryOf: the load-bearing rule reads product_name ONLY, never requirements", () => {
  const byId = (id: string) => RECORDS.find((b) => b.id === id)!;
  // THE TRAP: consumer accounts whose requirements contain "business days" stay out of Business.
  assert.equal(categoryOf(byId("truist-one-checking")), "bank_account", "Truist One Checking must not land in Business");
  assert.equal(categoryOf(byId("sofi-checking-savings")), "bank_account", "SoFi must not land in Business");
  assert.ok(byId("truist-one-checking").requirements.join(" ").includes("business days"), "the fixture must still contain the trap");
  // A business PRODUCT lands in Business whether it is an account or a card.
  assert.equal(categoryOf(byId("chase-ink-business-preferred")), "business");
  assert.equal(categoryOf(byId("bluevine-business-checking")), "business");
  assert.equal(categoryOf(byId("chase-sapphire-preferred")), "credit_card");
  assert.equal(categoryOf(byId("citi-premier-savings")), "savings");
});

test("landing page renders all 4 category sections, in order, with exact counts", () => {
  const ids = [...home.matchAll(/<section class="offer-sec" id="cat-([a-z_]+)">/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["business", "credit_card", "bank_account", "savings"]);
  assert.deepEqual(
    Object.fromEntries(ids.map((k) => [k, categoryCount(home, k)])),
    { business: 2, credit_card: 1, bank_account: 2, savings: 1 },
  );
  assert.equal(cards(home).length, RECORDS.length);
  // Singular/plural is rendered, not assumed.
  assert.match(home, /<span class="offer-count mono">1 offer<\/span>/);
  assert.match(home, /<span class="offer-count mono">2 offers<\/span>/);
  // The trap offers sit in Bank accounts, not Business.
  const business = sectionsById(home).business;
  assert.ok(!/Truist|SoFi/.test(business), "Truist/SoFi must not appear in the Business section");
  assert.match(sectionsById(home).bank_account, /Truist · One Checking/);
});

test("the chip filters point at sections that exist", () => {
  const hrefs = [...home.matchAll(/<a class="chip" href="#([a-z_-]+)">/g)].map((m) => m[1]);
  assert.equal(hrefs.length, 5, "All + one chip per present category");
  assert.equal(hrefs[0], "offers");
  assert.match(home, /id="offers"/);
  for (const h of hrefs.slice(1)) assert.ok(home.includes(`id="${h}"`), `chip #${h} has no target section`);
});

test("H8: every card carries its own source link and its own Verified stamp", () => {
  const rendered = cards(home);
  assert.equal(rendered.length, RECORDS.length);
  const sourceLinks = [...home.matchAll(/<a href="([^"]+)" rel="nofollow noopener" target="_blank">Source<\/a>/g)].map((m) => decode(m[1]));
  const stamps = [...home.matchAll(/<span>Verified (\d{4}-\d{2}-\d{2})<\/span>/g)].map((m) => m[1]);
  assert.equal(sourceLinks.length, rendered.length, "one source link per card");
  assert.equal(stamps.length, rendered.length, "one Verified <date> stamp per card");
  for (const b of RECORDS) {
    assert.ok(sourceLinks.includes(b.source_url!), `${b.id}: source_url is not linked on any card`);
    assert.ok(stamps.includes(b.last_verified_date!), `${b.id}: last_verified_date is not stamped on any card`);
  }
  // Each card's stamp is its own record's date, not a shared constant.
  for (const c of rendered) {
    const link = decode((c.match(/<a href="([^"]+)" rel="nofollow noopener"/) ?? [])[1] ?? "");
    const offer = RECORDS.find((b) => b.source_url === link);
    assert.ok(offer, `card Source link ${link} is not any record's source_url`);
    assert.ok(c.includes(`Verified ${offer!.last_verified_date}`), `${offer!.id}: card stamp does not match its record`);
  }
});

test("requirements render in FULL — no bullet may cut a word in half", () => {
  // Full render, not "cut on a word boundary": a boundary cut still hides material terms. Truist's
  // own requirement cut at 104 on a boundary would read "…or later than February 2…", silently
  // dropping the promo-code and date conditions. Both are still partial terms on a page whose
  // claim is the exact fine print, so the card shows the requirement whole and links to the rest.
  for (const c of cards(home)) {
    const name = decode((c.match(/<div class="offer-name">.*?>([^<]*)<\/a>/) ?? [])[1] ?? "");
    const offer = RECORDS.find((b) => `${b.bank_or_issuer} · ${b.product_name}` === name);
    assert.ok(offer, `no fixture matches the card titled ${name}`);
    const lis = [...c.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => decode(m[1]));
    const shown = offer!.requirements.slice(0, 2);
    assert.equal(lis.length, shown.length, `${name}: expected ${shown.length} requirement bullets`);
    lis.forEach((li, i) => assert.equal(li, shown[i], `${name} bullet ${i + 1} is not the requirement verbatim`));
  }
  // Guard the guard: the fixture must still reproduce the shipped mid-word slice.
  const cut = TRUIST_REQ.slice(0, 104);
  assert.ok(
    TRUIST_REQ.length > 104 && /[A-Za-z0-9]/.test(TRUIST_REQ[104]) && /[A-Za-z0-9]/.test(cut.slice(-1)),
    "fixture no longer reproduces the mid-word truncation defect",
  );
});

test("no <table> survives on the human offer pages", () => {
  assert.doesNotMatch(home, /<table/i);
  assert.doesNotMatch(browse, /<table/i);
  assert.equal(cards(browse).length, RECORDS.length, "browse page renders an offer card per record");
});

test("dead table CSS is gone from the stylesheet", () => {
  const css = fs.readFileSync(path.join("public", "assets", "site.css"), "utf8");
  assert.doesNotMatch(css, /table\.offers/, "table.offers has no emitter left in src/");
  assert.doesNotMatch(css, /\.tbl-wrap\b/, ".tbl-wrap has no emitter left in src/");
});

test("H6: one self-hosted subset font, declared, used, and no CDN", () => {
  const css = fs.readFileSync(path.join("public", "assets", "site.css"), "utf8");
  const face = css.match(/@font-face\s*{[^}]*}/g) ?? [];
  assert.equal(face.length, 1, "exactly one @font-face");
  assert.match(face[0], /font-family:\s*"Archivo"/);
  assert.match(face[0], /src:\s*url\("archivo-latin\.woff2"\)\s*format\("woff2"\)/);
  assert.match(face[0], /font-weight:\s*100 900/, "the variable weight axis is clamped to a static range");
  // Declaring a family nobody uses is not a deliverable: it must head the body font stack.
  assert.match(css, /--sans:\s*"Archivo",/);
  assert.doesNotMatch(css, /fonts\.(googleapis|gstatic)\.com/, "H6 forbids a third-party font CDN");

  const file = path.join("public", "assets", "archivo-latin.woff2");
  assert.ok(fs.existsSync(file), "public/assets/archivo-latin.woff2 is missing");
  const buf = fs.readFileSync(file);
  assert.equal(buf.subarray(0, 4).toString("latin1"), "wOF2", "not a woff2 container");
  assert.ok(buf.length > 5000 && buf.length < 60000, `font is ${buf.length} bytes — outside the sane band`);
});

/* --- one server, for the served-asset test --- */
const PORT = 39000 + Math.floor(Math.random() * 900);
const origin = `http://localhost:${PORT}`;
let child: ChildProcess;

before(async () => {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "benefits-b2-"));
  const dbFile = path.join(dir, "bonuses.json");
  fs.writeFileSync(dbFile, JSON.stringify({ bonuses: RECORDS }));
  child = spawn(process.execPath, ["dist/web-server.js"], {
    env: { ...process.env, PORT: String(PORT), BONUS_DB_PATH: dbFile, PUBLIC_URL: origin },
    stdio: "ignore",
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${origin}/healthz`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
});
after(() => child?.kill());

test("the server sends the font as font/woff2, byte-identical to the file on disk", async () => {
  const buf = fs.readFileSync(path.join("public", "assets", "archivo-latin.woff2"));
  const res = await fetch(`${origin}/assets/archivo-latin.woff2`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "font/woff2");
  const body = Buffer.from(await res.arrayBuffer());
  assert.equal(body.length, buf.length, "served font differs in size from the file on disk");
  assert.ok(body.equals(buf), "served font differs in bytes from the file on disk");
});
