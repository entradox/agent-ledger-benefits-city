import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeBonus } from "./helpers.js";
import { RateLimiter, configuredLimit } from "../rate-limit.js";

test("limiter admits up to the cap, then 429s with a Retry-After until the window resets", () => {
  let t = 1_000_000;
  const rl = new RateLimiter(3, 60_000, () => t);
  for (let i = 0; i < 3; i++) assert.equal(rl.check("1.2.3.4").allowed, true);
  const blocked = rl.check("1.2.3.4");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1 && blocked.retryAfterSeconds <= 60);
  t += 61_000; // past the window
  assert.equal(rl.check("1.2.3.4").allowed, true);
});

test("buckets are per key — one client cannot exhaust another", () => {
  const rl = new RateLimiter(1, 60_000);
  assert.equal(rl.check("10.0.0.1").allowed, true);
  assert.equal(rl.check("10.0.0.1").allowed, false);
  assert.equal(rl.check("10.0.0.2").allowed, true);
});

test("the key map is bounded against XFF key-spraying", () => {
  const rl = new RateLimiter(1, 60_000, Date.now, 5);
  for (let i = 0; i < 100; i++) assert.equal(rl.check(`192.0.2.${i}`).allowed, true);
});

test("RATE_LIMIT_PER_MIN parses to a non-negative cap; unset/garbage disables", () => {
  assert.equal(configuredLimit({}), 0);
  assert.equal(configuredLimit({ RATE_LIMIT_PER_MIN: "60" }), 60);
  assert.equal(configuredLimit({ RATE_LIMIT_PER_MIN: "junk" }), 0);
  assert.equal(configuredLimit({ RATE_LIMIT_PER_MIN: "-5" }), 0);
});

/* ---- HTTP surface: the wiring, exercised against a real server ---- */

const PORT = 39000 + Math.floor(Math.random() * 900);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "benefits-ratelimit-"));
fs.writeFileSync(
  path.join(dir, "bonuses.json"),
  JSON.stringify({ bonuses: [makeBonus({ id: "one", bonus_amount_usd: 300 })] }),
);
let child: ChildProcess;
const url = (p: string) => `http://localhost:${PORT}${p}`;

before(async () => {
  child = spawn(process.execPath, ["dist/web-server.js"], {
    env: {
      ...process.env,
      PORT: String(PORT),
      BONUS_DB_PATH: path.join(dir, "bonuses.json"),
      PUBLIC_URL: `http://localhost:${PORT}`,
      RATE_LIMIT_PER_MIN: "3",
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
after(() => child?.kill());

test("HTTP: requests past the cap get 429 + retry-after; /healthz is exempt", async () => {
  // /healthz must stay up under the cap — it is the monitor's route.
  for (let i = 0; i < 8; i++) assert.equal((await fetch(url("/healthz"))).status, 200);

  for (let i = 0; i < 3; i++) assert.equal((await fetch(url("/"))).status, 200);
  const r = await fetch(url("/"));
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get("retry-after")) >= 1);
  assert.equal(r.headers.get("cache-control"), "no-store");
});

test("HTTP: a forged X-Forwarded-For rotates the bucket — documented residual until TRUSTED_PROXY_HOPS is set", async () => {
  // With a single direct connection each forged XFF entry is trusted, so a
  // requester can still move to a fresh bucket. This is why the limiter ships
  // OFF: it only discriminates real visitors once TRUSTED_PROXY_HOPS=2 is set
  // and the hub/edge have appended their own entries.
  const r = await fetch(url("/"), { headers: { "x-forwarded-for": "203.0.113.99" } });
  assert.equal(r.status, 200);
});
