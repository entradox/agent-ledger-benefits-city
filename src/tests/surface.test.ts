import test from "node:test";
import assert from "node:assert/strict";
import { iso, makeBonus, setupDb } from "./helpers.js";

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";
const db = await setupDb([
  makeBonus({ id: "bank-1", bonus_amount_usd: 300 }),
  makeBonus({ id: "sav-1", bonus_type: "savings", bonus_amount_usd: 200, expiry_date: iso(30) }),
]);

test("browse page can filter to savings and labels the type", async () => {
  const { browsePage, detailPage } = await import("../site.js");
  const ctx = { basePath: "/benefits", publicUrl: "https://aiagentscity.com/benefits" };
  const html = browsePage(ctx, { type: "savings", state: "", min: "", dd: "", q: "", sort: "value" });
  assert.match(html, /sav-1/);
  assert.doesNotMatch(html, /bank-1/);
  assert.match(html, /<option value="savings" selected/);
  assert.match(detailPage(ctx, "sav-1")!, /Savings account bonus/);
});

test("db search honours savings", () => {
  assert.deepEqual(db.searchBonuses({ bonus_type: "savings" }).map((b) => b.id), ["sav-1"]);
});
