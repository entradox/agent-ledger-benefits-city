import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { iso, makeBonus } from "./helpers.js";

/* D-1552 — surface completeness: homepage + /bonuses JSON-LD, /pricing.md, /okf/index.md,
 * sitemap + llms.txt references. */

const PORT = 38000 + Math.floor(Math.random() * 1000);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "benefits-d1545-"));
const dbFile = path.join(dir, "bonuses.json");
fs.writeFileSync(
  dbFile,
  JSON.stringify({
    bonuses: [
      makeBonus({ id: "bank-1", bonus_amount_usd: 500 }),
      makeBonus({ id: "card-1", bonus_type: "credit_card", bonus_amount_usd: 800, expiry_date: iso(20) }),
    ],
  }),
);
let child: ChildProcess;
const url = (p: string) => `http://localhost:${PORT}${p}`;

before(async () => {
  child = spawn(process.execPath, ["dist/web-server.js"], {
    env: { ...process.env, PORT: String(PORT), BONUS_DB_PATH: dbFile, PUBLIC_URL: `http://localhost:${PORT}` },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url("/healthz"))).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
});
after(() => child?.kill());

const ldBlocks = (html: string): object[] =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]!));

test("homepage emits WebSite + Organization + FAQPage JSON-LD, valid JSON", async () => {
  const r = await fetch(url("/"));
  assert.equal(r.status, 200);
  const blocks = ldBlocks(await r.text());
  const types = blocks.map((b) => (b as { "@type"?: string })["@type"]);
  assert.ok(types.includes("WebSite"), "WebSite missing");
  assert.ok(types.includes("Organization"), "Organization missing");
  assert.ok(types.includes("FAQPage"), "FAQPage missing");
  const faq = blocks.find((b) => (b as { "@type"?: string })["@type"] === "FAQPage") as {
    mainEntity: { name: string; acceptedAnswer: { text: string } }[];
  };
  assert.ok(faq.mainEntity.length >= 5);
  assert.ok(faq.mainEntity.every((e) => e.name && e.acceptedAnswer.text));
});

test("/bonuses emits an ItemList whose items match the served offers", async () => {
  const r = await fetch(url("/bonuses"));
  assert.equal(r.status, 200);
  const blocks = ldBlocks(await r.text());
  const list = blocks.find((b) => (b as { "@type"?: string })["@type"] === "ItemList") as {
    numberOfItems: number;
    itemListElement: { position: number; url: string; name: string }[];
  };
  assert.equal(list.numberOfItems, 2);
  assert.deepEqual(
    list.itemListElement.map((e) => e.url.split("/").pop()).sort(),
    ["bank-1", "card-1"],
  );
});

test("/pricing.md and /okf/index.md serve markdown; llms.txt + sitemap reference them", async () => {
  const pricing = await fetch(url("/pricing.md"));
  assert.equal(pricing.status, 200);
  assert.match(pricing.headers.get("content-type") ?? "", /text\/markdown/);
  assert.match(await pricing.text(), /\*\*Free\.\*\*/);

  for (const p of ["/okf", "/okf/", "/okf/index.md"]) {
    const r = await fetch(url(p));
    assert.equal(r.status, 200, p);
    assert.match(r.headers.get("content-type") ?? "", /text\/markdown/, p);
    assert.match(await r.text(), /api\/bonuses\.json/, p);
  }

  const llms = await (await fetch(url("/llms.txt"))).text();
  assert.ok(llms.includes("/pricing.md") && llms.includes("/okf/index.md"));
  const sitemap = await (await fetch(url("/sitemap.xml"))).text();
  assert.ok(sitemap.includes("/pricing.md"));
});
