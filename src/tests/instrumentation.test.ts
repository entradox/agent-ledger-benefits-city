import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { iso, makeBonus } from "./helpers.js";

/* Instrumentation coverage: machine surfaces record feed_hit (bot UA), HTML pages
 * record page_view for humans and page:* feed hits for agents, and bot GETs of the
 * /go choke point record go:<id> feed hits rather than suppressed apply clicks. */

const PORT = 39000 + Math.floor(Math.random() * 1000);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "benefits-instr-"));
const dbFile = path.join(dir, "bonuses.json");
const metricsFile = path.join(dir, "metrics.sqlite");
fs.writeFileSync(
  dbFile,
  JSON.stringify({ bonuses: [makeBonus({ id: "live-aff", bonus_amount_usd: 500 })] }),
);
let child: ChildProcess;
const url = (p: string) => `http://localhost:${PORT}${p}`;

const BOT_UA = "testbot/1.0";
const HUMAN_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const get = (p: string, ua: string) => fetch(url(p), { headers: { "user-agent": ua }, redirect: "manual" });

before(async () => {
  child = spawn(process.execPath, ["dist/web-server.js"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      BONUS_DB_PATH: dbFile,
      METRICS_DB_PATH: metricsFile,
      PUBLIC_URL: `http://localhost:${PORT}`,
    },
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

after(() => child?.kill("SIGTERM"));

test("discovery + manifest surfaces record feed hits", async () => {
  for (const p of ["/openapi.json", "/server.json", "/.well-known/agent.json", "/auth.md", "/skill.md", "/pricing.md", "/okf", "/robots.txt", "/sitemap.xml", "/api"])
    assert.equal((await get(p, BOT_UA)).status, 200, p);
});

test("per-offer JSON fetch records the offer id", async () => {
  assert.equal((await get("/api/bonuses/live-aff", BOT_UA)).status, 200);
});

test("HTML page: human -> page_view, bot -> page:* feed hit", async () => {
  assert.equal((await get("/agents", HUMAN_UA)).status, 200);
  assert.equal((await get("/agents", BOT_UA)).status, 200);
});

test("bot apply-link follow records go:<id> feed hit; human records apply_click", async () => {
  const bot = await get("/go/live-aff", BOT_UA);
  assert.equal(bot.status, 302);
  const human = await get("/go/live-aff", HUMAN_UA);
  assert.equal(human.status, 302);
});

test("POST /mcp records an mcp feed hit even for a bare initialize", async () => {
  await fetch(url("/mcp"), {
    method: "POST",
    headers: {
      "user-agent": BOT_UA,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "0" } },
    }),
  });
});

test("events flushed on shutdown contain the expected kinds", () => {
  return new Promise<void>((resolve, reject) => {
    child.kill("SIGTERM"); // closeMetrics() flushes the queue before exit
    child.once("exit", () => {
      try {
        const db = new Database(metricsFile);
        const feeds = (db.prepare("SELECT feed FROM events WHERE kind='feed_hit'").all() as { feed: string }[]).map(
          (r) => r.feed,
        );
        const pv = (db.prepare("SELECT path FROM events WHERE kind='page_view'").all() as { path: string }[]).map(
          (r) => r.path,
        );
        const ac = db.prepare("SELECT COUNT(*) n FROM events WHERE kind='apply_click'").get() as { n: number };
        db.close();
        for (const f of ["openapi.json", "server.json", ".well-known/agent.json", "auth.md", "skill.md", "pricing.md", "okf", "robots.txt", "sitemap.xml", "api", "api/bonus:live-aff", "go:live-aff", "mcp", "page:/agents"])
          assert.ok(feeds.includes(f), `missing feed_hit ${f}`);
        assert.deepEqual(pv, ["/agents"]);
        assert.equal(ac.n, 1); // only the human GET counts; the bot went to feed_hit
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
});
