import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { INDEXNOW_KEY } = await import("../indexnow.js");
const PY = "/opt/miniconda3/bin/python3";

test("IndexNow key is a public 32-hex token (the key file is public by design — not a secret)", () => {
  assert.match(INDEXNOW_KEY, /^[a-f0-9]{32}$/);
});

function dryRun(sitemap: string, base: string) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "inow-")), "sitemap.xml");
  fs.writeFileSync(f, sitemap);
  return spawnSync(PY, ["scripts/indexnow_ping.py", "--dry-run", "--sitemap-file", f, "--base", base], { encoding: "utf8" });
}

test("ping script --dry-run builds the IndexNow payload, sends nothing, and keeps only URLs under the base", () => {
  const base = "https://aiagentscity.com/benefits";
  const sm = `<?xml version="1.0"?><urlset>
    <url><loc>${base}/</loc></url>
    <url><loc>${base}/banks/chase</loc></url>
    <url><loc>https://evil.example/steal</loc></url>
    <url><loc>https://aiagentscity.com/other-product</loc></url>
  </urlset>`;
  const r = dryRun(sm, base);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.host, "aiagentscity.com");
  assert.equal(out.key, INDEXNOW_KEY);
  assert.equal(out.keyLocation, `${base}/${INDEXNOW_KEY}.txt`);
  assert.deepEqual(out.urlList, [`${base}/`, `${base}/banks/chase`]);
  assert.match(r.stderr, /DRY RUN/i);
});

test("ping script refuses to run with no URLs (no data is not a success)", () => {
  const r = dryRun("<urlset></urlset>", "https://aiagentscity.com/benefits");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /no urls/i);
});
