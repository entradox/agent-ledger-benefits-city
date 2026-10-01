import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { iso, makeBonus } from "./helpers.js";

const PORT = 38000 + Math.floor(Math.random() * 1000);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "benefits-http-"));
const dbFile = path.join(dir, "bonuses.json");
fs.writeFileSync(
  dbFile,
  JSON.stringify({
    bonuses: [
      makeBonus({ id: "live-aff", bonus_amount_usd: 500, affiliate_url: "https://partner.example/click?x=1" }),
      makeBonus({ id: "live-plain", bonus_amount_usd: 400 }),
      makeBonus({ id: "dead", bonus_amount_usd: 900, expiry_date: iso(-2) }),
      makeBonus({ id: "evil", bonus_amount_usd: 100, affiliate_url: "javascript:alert(1)", application_url: null, source_url: null }),
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

test("/go redirects to the affiliate URL, 404s on expired and on junk-scheme links", async () => {
  const r = await fetch(url("/go/live-aff"), { redirect: "manual" });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), "https://partner.example/click?x=1");
  assert.equal((await fetch(url("/go/dead"), { redirect: "manual" })).status, 404);
  assert.equal((await fetch(url("/go/evil"), { redirect: "manual" })).status, 404);
});

test("feeds never expose affiliate_url or expired offers; version header present", async () => {
  const r = await fetch(url("/api/bonuses.json"));
  assert.equal(r.headers.get("x-api-version"), "2026-09-30");
  const body = await r.text();
  assert.ok(!body.includes("partner.example"));
  assert.ok(!body.includes('"id": "dead"'));
  assert.ok(body.includes('"id": "live-aff"'));
  assert.equal((await fetch(url("/api/bonuses/dead"))).status, 404);
});

test("discovery endpoints return 200 and point at the MCP endpoint", async () => {
  for (const p of ["/server.json", "/.well-known/mcp.json"]) {
    const r = await fetch(url(p));
    assert.equal(r.status, 200, p);
    const j = await r.json();
    assert.equal(j.name, "io.github.entradox/benefits-city");
    assert.equal(j.remotes[0].type, "streamable-http");
    assert.equal(j.remotes[0].url, `http://localhost:${PORT}/mcp`);
  }
  const a = await fetch(url("/auth.md"));
  assert.equal(a.status, 200);
  assert.match(await a.text(), /no credential/i);
});

test("stats and healthz count only servable offers", async () => {
  assert.equal((await (await fetch(url("/healthz"))).json()).offers, 3);
  assert.equal((await (await fetch(url("/api/stats"))).json()).total_offers, 3);
});

test("/api/stats (highest_bonus, expiring list) never exposes affiliate_url", async () => {
  const body = await (await fetch(url("/api/stats"))).text();
  assert.ok(!body.includes("partner.example"), "raw affiliate URL leaked via /api/stats");
  assert.ok(!body.includes("affiliate_url"));
});

test("REST parity: /api/search, /api/expiring, /api/compare return public JSON; bad params are typed 400; by-id 404 is typed", async () => {
  const s = await fetch(url("/api/search?limit=2"));
  assert.equal(s.status, 200);
  assert.match(s.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(s.headers.get("x-api-version"), "2026-09-30");
  const sBody = await s.text();
  assert.ok(!sBody.includes("partner.example"));
  assert.equal(JSON.parse(sBody).length, 2);

  const bad = await fetch(url("/api/search?bonus_type=crypto"));
  assert.equal(bad.status, 400);
  const be = (await bad.json()).error;
  assert.equal(be.type, "invalid_param");
  assert.equal(be.param, "bonus_type");

  assert.equal((await fetch(url("/api/expiring?days=60"))).status, 200);
  assert.equal((await fetch(url("/api/expiring?days=0"))).status, 400);

  const cmp = await fetch(url("/api/compare?ids=live-aff,live-plain"));
  assert.equal(cmp.status, 200);
  assert.ok(!(await cmp.text()).includes("partner.example"));
  assert.equal((await fetch(url("/api/compare?ids=live-aff,ghost"))).status, 404);
  assert.equal((await fetch(url("/api/compare?ids=live-aff"))).status, 400);

  const nf = await fetch(url("/api/bonuses/ghost"));
  assert.equal(nf.status, 404);
  assert.equal((await nf.json()).error.type, "not_found");
});
