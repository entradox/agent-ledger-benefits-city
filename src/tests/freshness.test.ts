import test from "node:test";
import assert from "node:assert/strict";
import { iso, makeBonus } from "./helpers.js";
import { amountNeedles, classify, hashText } from "../freshness.js";
import { makeCanaryFixtures } from "../freshness-canary.js";

const bank = makeBonus({ id: "b", bonus_amount_usd: 300, expiry_date: iso(10) });
const page = (t: string) => ({ status: 200, text: `<html><body><script>x()</script><p>${t}</p></body></html>` });

test("good page with the stated amount is ok", () => {
  assert.equal(classify(bank, page("Earn a $300 bonus when you open an account"), null).finding.kind, "ok");
});

test("changed-amount fixture is flagged (record says $300, page says $400)", () => {
  const f = classify(bank, page("Earn a $400 bonus when you open an account"), null).finding;
  assert.equal(f.kind, "amount_missing");
  assert.match(f.detail, /\$300/);
});

test("content change vs prior hash is flagged; same hash is ok", () => {
  const first = classify(bank, page("Earn a $300 bonus"), null);
  assert.equal(classify(bank, page("Earn a $300 bonus"), first.hash).finding.kind, "ok");
  assert.equal(classify(bank, page("Earn a $300 bonus — new terms apply"), first.hash).finding.kind, "changed");
});

test("date-expired record is expired without needing a fetch", () => {
  const dead = makeBonus({ id: "d", expiry_date: iso(-1) });
  assert.equal(classify(dead, null, null).finding.kind, "expired");
});

test("BOT-BLOCK IS NOT DEAD: 403/429/'oops' pages are blocked, never expired/gone", () => {
  for (const r of [
    { status: 403, text: "Access Denied" },
    { status: 429, text: "" },
    { status: 200, text: "<p>Oops, something went wrong</p>" },
    { status: 200, text: "<p>Please verify you are human (captcha)</p>" },
    { status: 200, text: "x", robotsBlocked: true },
  ])
    assert.equal(classify(bank, r, null).finding.kind, "blocked", JSON.stringify(r));
});

test("404/410 is gone; null/error is unreachable", () => {
  assert.equal(classify(bank, { status: 404, text: "" }, null).finding.kind, "gone");
  assert.equal(classify(bank, { status: 410, text: "" }, null).finding.kind, "gone");
  assert.equal(classify(bank, null, null).finding.kind, "unreachable");
  assert.equal(classify(bank, { status: null, text: "", error: "ECONNRESET" }, null).finding.kind, "unreachable");
});

test("credit cards are checked on points, not the estimated USD value", () => {
  const card = makeBonus({ id: "c", bonus_type: "credit_card", bonus_amount_usd: 1500, bonus_points: 75000 });
  assert.ok(amountNeedles(card).includes("75,000"));
  assert.ok(!amountNeedles(card).includes("$1,500"));
  assert.equal(classify(card, page("Earn 75,000 points"), null).finding.kind, "ok");
  assert.equal(classify(card, page("Earn 60,000 points"), null).finding.kind, "amount_missing");
});

test("hashText ignores markup and whitespace noise", () => {
  assert.equal(hashText("<p>Hello   World</p>"), hashText("<div>hello world</div>"));
  assert.notEqual(hashText("a"), hashText("b"));
});

test("canary: known-good ok, every known-bad is non-ok", () => {
  const { good, bad } = makeCanaryFixtures();
  assert.equal(classify(good.record, good.fetched, null).finding.kind, "ok");
  for (const b of bad) assert.notEqual(classify(b.record, b.fetched, null).finding.kind, "ok", b.record.id);
});

test("exit policy: blocked/unreachable are informational; actionable kinds alert; total blackout is BROKEN not clean", async () => {
  const { exitCodeFor } = await import("../freshness.js");
  const f = (kind: string, id = "x") => ({ id, kind, detail: "" }) as never;
  assert.equal(exitCodeFor([], 29), 0);
  assert.equal(exitCodeFor([f("blocked", "a"), f("unreachable", "b")], 29), 0);
  assert.equal(exitCodeFor([f("blocked", "a"), f("amount_missing", "b")], 29), 1);
  for (const k of ["expired", "changed", "gone"]) assert.equal(exitCodeFor([f(k)], 29), 1, k);
  // every record unreachable = no data was obtained: never a pass (one finding per record id)
  assert.equal(exitCodeFor(Array.from({ length: 5 }, (_, i) => f("unreachable", `r${i}`)), 5), 3);
});

test("I-3: a stale last_verified_date (>30 days or missing) is an actionable finding", async () => {
  const { staleFinding } = await import("../freshness.js");
  assert.equal(staleFinding(makeBonus({ last_verified_date: iso(-10) }), iso(0)), null);
  assert.equal(staleFinding(makeBonus({ last_verified_date: iso(-30) }), iso(0)), null); // exactly 30 = still within SLA
  assert.equal(staleFinding(makeBonus({ id: "s", last_verified_date: iso(-31) }), iso(0))!.kind, "stale");
  assert.equal(staleFinding(makeBonus({ id: "n", last_verified_date: null }), iso(0))!.kind, "stale");
});

test("I-3: a fleet-wide bot-block/unreachable run is BROKEN (exit 3), never clean; stale is actionable", async () => {
  const { exitCodeFor } = await import("../freshness.js");
  const f = (kind: string, id = "x") => ({ id, kind, detail: "" }) as never;
  assert.equal(exitCodeFor(Array.from({ length: 5 }, (_, i) => f("blocked", `r${i}`)), 5), 3);
  assert.equal(
    exitCodeFor([f("blocked", "r0"), f("blocked", "r1"), f("blocked", "r2"), f("unreachable", "r3"), f("unreachable", "r4")], 5),
    3,
  );
  // 4 of 5 blocked is still informational (one record was actually read)
  assert.equal(exitCodeFor([f("blocked", "r0"), f("blocked", "r1"), f("blocked", "r2"), f("unreachable", "r3")], 5), 0);
  assert.equal(exitCodeFor([f("stale")], 29), 1);
});
