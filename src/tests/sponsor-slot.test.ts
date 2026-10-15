import test from "node:test";
import assert from "node:assert/strict";
import { iso, makeBonus, setupDb } from "./helpers.js";

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";
await setupDb([makeBonus({ id: "t1", expiry_date: iso(20) })]);
const ctx = { basePath: "/benefits", publicUrl: "https://aiagentscity.com/benefits" };

const setDoor = (v?: string) => {
  if (v === undefined) delete process.env.SPONSOR_URL;
  else process.env.SPONSOR_URL = v;
};

test("with SPONSOR_URL set: landing and browse render the slot with a real https buy door", async () => {
  setDoor("https://buy.stripe.com/test-door");
  try {
    const { landingPage, browsePage } = await import("../site.js");
    for (const html of [landingPage(ctx), browsePage(ctx, { type: "", state: "", min: "", dd: "", q: "", sort: "value" })]) {
      assert.match(html, /class="sponsor-slot"/);
      assert.match(html, /badge badge-sponsored">Sponsored</);
      assert.match(html, /href="https:\/\/buy\.stripe\.com\/test-door"/);
      assert.match(html, /rel="sponsored nofollow noopener"/);
      assert.doesNotMatch(html, /buy link pending/);
    }
  } finally {
    setDoor();
  }
});

test("unset SPONSOR_URL renders the honest pending state — never a dead button", async () => {
  setDoor();
  const { landingPage } = await import("../site.js");
  const html = landingPage(ctx);
  assert.match(html, /buy link pending/);
  assert.doesNotMatch(html, /class="sponsor-slot"[^]*?href=""/); // no empty-href anchor inside the slot
  assert.doesNotMatch(html, /<a[^>]*href="undefined"/);
});

test("a non-https SPONSOR_URL is rejected and falls back to pending", async () => {
  for (const bad of ["javascript:alert(1)", "http://insecure.example/x", "  ", "notaurl"]) {
    setDoor(bad);
    const { landingPage } = await import("../site.js");
    const html = landingPage(ctx);
    assert.ok(html.includes("buy link pending"), `door ${JSON.stringify(bad)} should render pending`);
    if (bad.trim()) assert.ok(!html.includes(bad.trim()), `door ${JSON.stringify(bad)} must not appear in markup`);
  }
  setDoor();
});

test("the slot sits outside the offers grid on both pages", async () => {
  setDoor("https://buy.stripe.com/test-door");
  try {
    const { landingPage, browsePage } = await import("../site.js");
    for (const html of [landingPage(ctx), browsePage(ctx, { type: "", state: "", min: "", dd: "", q: "", sort: "value" })]) {
      const grid = html.indexOf('id="offers"');
      const slot = html.indexOf('class="sponsor-slot"');
      assert.ok(grid > -1 && slot > -1, "both grid and slot present");
      assert.ok(slot > grid, "slot after the grid");
      const closeOffers = html.indexOf("</div>", grid); // #offers closes before the slot
      assert.ok(closeOffers < slot);
    }
  } finally {
    setDoor();
  }
});

test("the slot never claims to affect ranking or records, and disclosure names the paid placement", async () => {
  setDoor("https://buy.stripe.com/test-door");
  try {
    const { landingPage, disclosurePage } = await import("../site.js");
    assert.match(landingPage(ctx), /never changes which offers we list/i);
    const d = disclosurePage(ctx);
    assert.match(d, /Paid placement/);
    assert.match(d, /sponsor slot/i);
  } finally {
    setDoor();
  }
});
