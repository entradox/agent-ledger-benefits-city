import test from "node:test";
import assert from "node:assert/strict";
import { makeBonus, setupDb } from "./helpers.js";

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";

/**
 * The operational door: AFFILIATE_URLS lets a partner link go live, rotate or be pulled as an env
 * change instead of a data change plus a deploy. This file runs in its own process, so mutating the
 * env here cannot affect any other suite.
 */
const ENV_AFF = "https://track.partner.example/click?aff=1";
process.env.AFFILIATE_URLS = JSON.stringify({
  "env-door": ENV_AFF,
  "record-owned": "https://env-override.example/click",
  "bad-value": "javascript:alert(1)",
  "not-a-string": 42,
  "unknown-id": "https://track.partner.example/click?aff=2",
});

const db = await setupDb([
  makeBonus({ id: "env-door", bonus_type: "credit_card", bonus_amount_usd: 500 }),
  makeBonus({
    id: "record-owned",
    bonus_type: "credit_card",
    bonus_amount_usd: 400,
    affiliate_url: "https://committed.example/click",
  }),
  makeBonus({ id: "bad-value", bonus_type: "credit_card", bonus_amount_usd: 300 }),
  makeBonus({ id: "plain", bonus_type: "credit_card", bonus_amount_usd: 200 }),
]);

const links = await import("../links.js");

test("an env entry turns a record into an affiliate link without touching its data", () => {
  const b = db.getBonusById("env-door")!;
  assert.equal(b.affiliate_url, null, "the record itself carries no affiliate URL");
  assert.equal(links.isSponsored(b), true);
  assert.equal(links.resolveApplyUrl(b), ENV_AFF);
});

test("the env door WINS over a committed URL, so a link can be rotated or pulled without a deploy", () => {
  const b = db.getBonusById("record-owned")!;
  assert.equal(b.affiliate_url, "https://committed.example/click");
  assert.equal(links.resolveApplyUrl(b), "https://env-override.example/click");
});

test("a non-http value is ignored — this must never become a redirect to a malformed target", () => {
  const b = db.getBonusById("bad-value")!;
  assert.equal(links.isSponsored(b), false);
  assert.equal(links.resolveApplyUrl(b), b.application_url);
});

test("records the env does not name are untouched", () => {
  const b = db.getBonusById("plain")!;
  assert.equal(links.isSponsored(b), false);
  assert.equal(links.resolveApplyUrl(b), b.application_url);
});

test("the partner URL never reaches a served payload", () => {
  const served = JSON.stringify(links.toPublic(db.getBonusById("env-door")!));
  assert.ok(!served.includes("affiliate_url"), "the raw affiliate field must never be served");
  assert.ok(!served.includes("track.partner.example"), "the partner host must never be served");
});

test("a malformed AFFILIATE_URLS fails safe, and does not disable a committed link", () => {
  const before = process.env.AFFILIATE_URLS;
  process.env.AFFILIATE_URLS = "{not json";
  try {
    // nothing from the broken door is applied...
    assert.equal(links.isSponsored(db.getBonusById("env-door")!), false, "a broken door must not promote an env-only link");
    // ...but a record carrying its own affiliate_url keeps it: the door cannot switch off committed links
    const committed = db.getBonusById("record-owned")!;
    assert.equal(links.isSponsored(committed), true);
    assert.equal(links.resolveApplyUrl(committed), "https://committed.example/click");
  } finally {
    process.env.AFFILIATE_URLS = before;
  }
  // and the door takes over again once the value is valid
  assert.equal(links.resolveApplyUrl(db.getBonusById("record-owned")!), "https://env-override.example/click");
});
