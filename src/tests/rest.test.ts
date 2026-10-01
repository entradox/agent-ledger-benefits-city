import test from "node:test";
import assert from "node:assert/strict";
import { iso, makeBonus, setupDb } from "./helpers.js";

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";
await setupDb([
  makeBonus({ id: "one", bonus_amount_usd: 500, affiliate_url: "https://partner.example/one", expiry_date: iso(5) }),
  makeBonus({ id: "two", bonus_amount_usd: 400, direct_deposit_required: true, states_available: ["TX"], expiry_date: iso(40) }),
  makeBonus({ id: "sav", bonus_type: "savings", bonus_amount_usd: 200, expiry_date: iso(60) }),
  makeBonus({ id: "old", bonus_amount_usd: 900, expiry_date: iso(-3) }),
]);
const rest = await import("../rest.js");
const sp = (q: string) => new URLSearchParams(q);
const err = (r: { body: unknown }) => (r.body as { error: { type: string; param?: string; message: string } }).error;

test("search: filters, default order, public shaping, expired excluded", () => {
  const all = rest.restSearch(sp(""));
  assert.equal(all.status, 200);
  const body = all.body as { id: string; sponsored: boolean }[];
  assert.deepEqual(body.map((b) => b.id), ["one", "two", "sav"]);
  assert.equal(body[0].sponsored, true);
  assert.ok(!JSON.stringify(all.body).includes("partner.example"));
  assert.deepEqual((rest.restSearch(sp("bonus_type=savings")).body as { id: string }[]).map((b) => b.id), ["sav"]);
  assert.deepEqual((rest.restSearch(sp("state=tx&direct_deposit_required=true")).body as { id: string }[]).map((b) => b.id), ["two"]);
  assert.deepEqual((rest.restSearch(sp("min_bonus_amount_usd=450")).body as { id: string }[]).map((b) => b.id), ["one"]);
  assert.equal((rest.restSearch(sp("limit=1")).body as unknown[]).length, 1);
});

test("search: bad params give a typed 400 naming the param — never a 500 or a silent default", () => {
  for (const [q, param] of [
    ["bonus_type=crypto", "bonus_type"],
    ["state=Texas", "state"],
    ["min_bonus_amount_usd=abc", "min_bonus_amount_usd"],
    ["min_bonus_amount_usd=-5", "min_bonus_amount_usd"],
    ["direct_deposit_required=maybe", "direct_deposit_required"],
    ["limit=0", "limit"],
    ["limit=101", "limit"],
    ["limit=2.5", "limit"],
  ] as const) {
    const r = rest.restSearch(sp(q));
    assert.equal(r.status, 400, q);
    assert.equal(err(r).type, "invalid_param", q);
    assert.equal(err(r).param, param, q);
  }
});

test("expiring: window, ordering, and bad days", () => {
  assert.deepEqual((rest.restExpiring(sp("days=10")).body as { id: string }[]).map((b) => b.id), ["one"]);
  assert.deepEqual((rest.restExpiring(sp("")).body as { id: string }[]).map((b) => b.id), ["one"]); // default 30
  for (const q of ["days=0", "days=366", "days=x"]) {
    const r = rest.restExpiring(sp(q));
    assert.equal(r.status, 400, q);
    assert.equal(err(r).param, "days");
  }
});

test("compare: 2-4 ids, unknown id is 404, wrong count is 400", () => {
  const ok = rest.restCompare(sp("ids=one,two"));
  assert.equal(ok.status, 200);
  const b = ok.body as { bonuses: { id: string }[]; summary: { highest_bonus_usd: string } };
  assert.deepEqual(b.bonuses.map((x) => x.id), ["one", "two"]);
  assert.equal(b.summary.highest_bonus_usd, "one");
  assert.ok(!JSON.stringify(ok.body).includes("partner.example"));
  assert.equal(rest.restCompare(sp("ids=one")).status, 400);
  assert.equal(rest.restCompare(sp("ids=a,b,c,d,e")).status, 400);
  assert.equal(rest.restCompare(sp("")).status, 400);
  const nf = rest.restCompare(sp("ids=one,ghost"));
  assert.equal(nf.status, 404);
  assert.equal(err(nf).type, "not_found");
  assert.equal(err(nf).param, "ids");
  assert.equal(rest.restCompare(sp("ids=one,one")).status, 400); // duplicates are not a comparison
});

test("by-id: found is public-shaped, missing is a typed 404", () => {
  const f = rest.restById("one");
  assert.equal(f.status, 200);
  assert.ok(!JSON.stringify(f.body).includes("partner.example"));
  const m = rest.restById("ghost");
  assert.equal(m.status, 404);
  assert.equal(err(m).type, "not_found");
  assert.equal(err(rest.restById("old")).type, "not_found"); // expired is not served
});
