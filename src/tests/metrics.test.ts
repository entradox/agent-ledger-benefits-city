import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "benefits-metrics-")), "metrics.sqlite");
process.env.METRICS_DB_PATH = dbFile;
const m = await import("../metrics.js");
m.initMetrics(); // creates the schema

function sidecar() {
  return new Database(dbFile);
}
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

test("rotating the daily salt DELETES earlier days' salts (past hashes become unlinkable)", () => {
  const side = sidecar();
  side.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)").run(`salt:${daysAgo(3)}`, "old-salt-1");
  side.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)").run(`salt:${daysAgo(1)}`, "old-salt-2");
  const req = { headers: { "user-agent": "Mozilla/5.0" }, socket: { remoteAddress: "203.0.113.9" } } as never;
  assert.ok(m.sessionHash(req).length > 0);
  const keys = (side.prepare("SELECT k FROM meta WHERE k LIKE 'salt:%'").all() as { k: string }[]).map((r) => r.k);
  side.close();
  assert.deepEqual(keys, [`salt:${daysAgo(0)}`]);
});

test("purgeOldEvents deletes events older than the retention window and keeps recent ones", () => {
  const side = sidecar();
  const ins = side.prepare("INSERT INTO events (ts, day, kind) VALUES (?, ?, 'page_view')");
  ins.run(`${daysAgo(120)}T00:00:00.000Z`, daysAgo(120));
  ins.run(`${daysAgo(91)}T00:00:00.000Z`, daysAgo(91));
  ins.run(`${daysAgo(10)}T00:00:00.000Z`, daysAgo(10));
  const removed = m.purgeOldEvents(90);
  const left = (side.prepare("SELECT day FROM events").all() as { day: string }[]).map((r) => r.day);
  side.close();
  assert.equal(removed, 2);
  assert.deepEqual(left, [daysAgo(10)]);
});

test("browse filter summary never stores free-text search; enumerated filters are kept", () => {
  const s = m.browseFilterSummary(new URLSearchParams("type=savings&state=TX&min=300&dd=no&q=chase+sapphire&sort=expiry"));
  assert.ok(!s.includes("chase"), s);
  assert.match(s, /q=1/);
  assert.match(s, /type=savings/);
  assert.ok(!s.includes("sort"));
  assert.equal(m.browseFilterSummary(new URLSearchParams("")), "");
});

test("browse filter summary keeps only known filter values; anything else is recorded as invalid", () => {
  const s = m.browseFilterSummary(new URLSearchParams("type=x&state=john.doe@mail.com&min=5551234567&dd=maybe"));
  assert.equal(s, "type=invalid&state=invalid&min=invalid&dd=invalid");
  assert.equal(m.browseFilterSummary(new URLSearchParams("state=tx&min=300&dd=yes")), "state=TX&min=300&dd=yes");
});

test("client IP trusts only proxy-appended X-Forwarded-For entries", () => {
  const req = (xff?: string) =>
    ({ headers: xff ? { "x-forwarded-for": xff } : {}, socket: { remoteAddress: "198.51.100.1" } }) as never;
  delete process.env.TRUSTED_PROXY_HOPS;
  assert.equal(m.clientIp(req("1.1.1.1, 203.0.113.7")), "203.0.113.7");
  assert.equal(m.clientIp(req()), "198.51.100.1");
  process.env.TRUSTED_PROXY_HOPS = "2";
  assert.equal(m.clientIp(req("1.1.1.1, 203.0.113.7, 10.0.0.2")), "203.0.113.7");
  assert.equal(m.clientIp(req("203.0.113.7")), "203.0.113.7");
  delete process.env.TRUSTED_PROXY_HOPS;
});

test("I-2: the retention purge runs at most once per UTC day, not only at startup", () => {
  assert.equal(m.maybePurgeOldEvents(new Date("2026-12-01T10:00:00Z")), true);
  assert.equal(m.maybePurgeOldEvents(new Date("2026-12-01T23:00:00Z")), false);
  assert.equal(m.maybePurgeOldEvents(new Date("2026-12-02T00:30:00Z")), true);
});
