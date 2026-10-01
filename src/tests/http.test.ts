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

test("agent.json and server-card.json are served and consistent with the MCP endpoint", async () => {
  const a = await fetch(url("/.well-known/agent.json"));
  assert.equal(a.status, 200);
  const aj = await a.json();
  assert.equal(aj.mcp.url, `http://localhost:${PORT}/mcp`);
  assert.equal(aj.auth.type, "none");
  const c = await fetch(url("/.well-known/mcp/server-card.json"));
  assert.equal(c.status, 200);
  const cj = await c.json();
  assert.equal(cj.tools.length, 6);
  assert.equal(cj.authentication.required, false);
});

test("/openapi.json is served and EVERY documented path really exists (no doc/route drift)", async () => {
  const r = await fetch(url("/openapi.json"));
  assert.equal(r.status, 200);
  const doc = await r.json();
  assert.equal(doc.servers[0].url, `http://localhost:${PORT}`);
  for (const p of Object.keys(doc.paths)) {
    const concrete = p.replace("{id}", "live-plain") + (p === "/api/compare" ? "?ids=live-plain,live-aff" : "");
    const res = await fetch(url(concrete), { redirect: "manual" });
    assert.ok([200, 302].includes(res.status), `${p} -> ${res.status}`);
  }
});

test("/skill.md is the product skill; /docs is the agent docs page", async () => {
  const s = await fetch(url("/skill.md"));
  assert.equal(s.status, 200);
  assert.match(s.headers.get("content-type") ?? "", /text\/markdown/);
  assert.match(await s.text(), /^---\nname: benefits-city/);
  const d = await fetch(url("/docs"));
  assert.equal(d.status, 200);
  assert.match(await d.text(), /For agents/);
});

test("BASE_PATH mount: new routes live under the prefix and 404 outside it", async () => {
  const PORT2 = PORT + 1000;
  const child2 = spawn(process.execPath, ["dist/web-server.js"], {
    env: { ...process.env, PORT: String(PORT2), BONUS_DB_PATH: dbFile, BASE_PATH: "/benefits", PUBLIC_URL: `http://localhost:${PORT2}/benefits` },
    stdio: "ignore",
  });
  try {
    const u2 = (p: string) => `http://localhost:${PORT2}${p}`;
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(u2("/benefits/healthz"))).ok) break; } catch { /* not up */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    for (const p of ["/skill.md", "/docs", "/openapi.json", "/.well-known/agent.json", "/.well-known/mcp/server-card.json", "/api/search"])
      assert.equal((await fetch(u2(`/benefits${p}`))).status, 200, p);
    assert.equal((await fetch(u2("/skill.md"))).status, 404);
    const aj = await (await fetch(u2("/benefits/.well-known/agent.json"))).json();
    assert.equal(aj.mcp.url, `http://localhost:${PORT2}/benefits/mcp`);
    // every advertised capability endpoint must actually answer under the production mount
    for (const c of aj.capabilities) {
      const ep = c.endpoint.replace("{id}", "live-plain") + (c.id === "compare_bonuses" ? "?ids=live-plain,live-aff" : "");
      assert.ok(ep.startsWith(`http://localhost:${PORT2}/benefits/`), ep);
      assert.equal((await fetch(ep)).status, 200, c.id);
    }
  } finally {
    child2.kill();
  }
});

test("changelog: page, JSON and Atom feed are served", async () => {
  const p = await fetch(url("/changelog"));
  assert.equal(p.status, 200);
  assert.match(await p.text(), /Changelog/);
  const j = await fetch(url("/changelog.json"));
  assert.equal(j.status, 200);
  assert.ok((await j.json()).entries.length >= 5);
  const f = await fetch(url("/feed.xml"));
  assert.equal(f.status, 200);
  assert.match(f.headers.get("content-type") ?? "", /atom\+xml/);
  assert.ok((await f.text()).includes('<feed xmlns="http://www.w3.org/2005/Atom">'));
});

test("SEO pages: real pages 200 with canonical + JSON-LD; empty/unknown are real 404s; sitemap advertises exactly the real ones", async () => {
  for (const p of ["/banks", "/banks/test-bank", "/best/bank-account", "/expiring-soon"]) {
    const r = await fetch(url(p));
    assert.equal(r.status, 200, p);
    const html = await r.text();
    assert.ok(html.includes('rel="canonical"'), p);
    assert.ok(html.includes("application/ld+json"), p);
  }
  // fixture has no regional offers, no savings/credit-card offers, and no such issuer
  for (const p of ["/states", "/states/tx", "/best/savings", "/best/credit-card", "/best/crypto", "/banks/nope", "/banks/dead"])
    assert.equal((await fetch(url(p))).status, 404, p);
  const sm = await (await fetch(url("/sitemap.xml"))).text();
  assert.ok(sm.includes("/banks/test-bank") && sm.includes("/best/bank-account"));
  assert.ok(!sm.includes("/states") && !sm.includes("/best/savings"));
});

test("citation surfaces: insights JSON, ai-plugin manifest (every canonical URL is a real route), badge.svg", async () => {
  const ins = await fetch(url("/api/insights"));
  assert.equal(ins.status, 200);
  const ij = await ins.json();
  assert.equal(ij.total_offers, 3);
  assert.match(ij.attribution, /Benefits City/);

  const mf = await fetch(url("/.well-known/ai-plugin-manifest.json"));
  assert.equal(mf.status, 200);
  const m = await mf.json();
  assert.ok(m.when_to_cite.length > 0 && m.not_the_right_citation_for.length > 0);
  for (const [k, u] of Object.entries<string>(m.canonical_data)) {
    if (k === "mcp") continue; // POST-only
    assert.ok(u.startsWith(`http://localhost:${PORT}/`), `${k} -> ${u}`);
    const code = (await fetch(u.replace("{id}", "live-plain"))).status;
    assert.ok(code !== 404 && code < 500, `${k} ${u} -> ${code}`);
  }

  const b = await fetch(url("/badge.svg"));
  assert.equal(b.status, 200);
  assert.match(b.headers.get("content-type") ?? "", /image\/svg\+xml/);
  assert.match(await b.text(), /3 offers/);
});
