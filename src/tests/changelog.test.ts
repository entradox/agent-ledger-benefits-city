import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { loadChangelog, changelogAtom, changelogJson } = await import("../changelog.js");
const U = "https://aiagentscity.com/benefits";
const tmp = (data: unknown) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cl-")), "c.json");
  fs.writeFileSync(f, typeof data === "string" ? data : JSON.stringify(data));
  return f;
};
const e = (o: Record<string, unknown> = {}) => ({ date: "2026-09-30", type: "added", offer_id: "x", title: "T", summary: "S", ...o });

test("loadChangelog sorts newest first and assigns stable ids", () => {
  const list = loadChangelog(tmp([e({ date: "2026-09-01", title: "old" }), e({ date: "2026-09-30", title: "new" })]));
  assert.deepEqual(list.map((x) => x.title), ["new", "old"]);
  assert.ok(list.every((x) => x.id));
  assert.equal(new Set(list.map((x) => x.id)).size, 2);
});

test("loadChangelog fails loudly on malformed entries (bad date/type, missing title, not an array)", () => {
  assert.throws(() => loadChangelog(tmp([e({ date: "9/30/26" })])), /date/);
  assert.throws(() => loadChangelog(tmp([e({ type: "exploded" })])), /type/);
  assert.throws(() => loadChangelog(tmp([e({ title: "" })])), /title/);
  assert.throws(() => loadChangelog(tmp({ not: "an array" })), /array/);
  assert.throws(() => loadChangelog(tmp("{broken")), /./);
});

test("feeds escape markup: Atom has no raw tags from entry text; JSON carries entries", () => {
  const list = loadChangelog(tmp([e({ title: "A & B <script>x</script>", summary: 'say "hi" <b>' })]));
  const atom = changelogAtom(U, list);
  assert.match(atom, /^<\?xml version="1.0" encoding="utf-8"\?>/);
  assert.ok(atom.includes('<feed xmlns="http://www.w3.org/2005/Atom">'));
  assert.ok(!atom.includes("<script>") && !atom.includes("<b>"));
  assert.ok(atom.includes("A &amp; B &lt;script&gt;"));
  assert.ok(atom.includes(`${U}/changelog`));
  const j = changelogJson(U, list) as { entries: unknown[]; feed: string };
  assert.equal(j.entries.length, 1);
  assert.equal(j.feed, `${U}/feed.xml`);
});

test("the shipped changelog is valid and every offer id it names exists in the seed data", () => {
  const list = loadChangelog();
  assert.ok(list.length >= 5);
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
  const seedIds = new Set<string>();
  for (const f of fs.readdirSync(path.join(root, "seed-data")).filter((x) => x.endsWith(".json")))
    for (const b of JSON.parse(fs.readFileSync(path.join(root, "seed-data", f), "utf8"))) seedIds.add(b.id);
  for (const x of list) if (x.offer_id && x.type !== "removed") assert.ok(seedIds.has(x.offer_id), `${x.id}: ${x.offer_id}`);
});
