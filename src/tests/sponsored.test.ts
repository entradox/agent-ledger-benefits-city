import test from "node:test";
import assert from "node:assert/strict";
import { iso, makeBonus, setupDb } from "./helpers.js";

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";
const db = await setupDb([
  makeBonus({ id: "spons", affiliate_url: "https://partner.example/s", expiry_date: iso(5) }),
  makeBonus({ id: "plain", expiry_date: iso(5) }),
]);
const ctx = { basePath: "/benefits", publicUrl: "https://aiagentscity.com/benefits" };

test("Morgan pre-live: a VISIBLE 'Sponsored' label sits beside every affiliate Apply button (rel alone is invisible)", async () => {
  const { detailPage } = await import("../site.js");
  const html = detailPage(ctx, "spons")!;
  assert.match(html, /<span class="badge badge-sponsored">Sponsored<\/span>/);
  assert.match(html, /affiliate link/i);
  assert.match(html, /rel="sponsored nofollow noopener"/);
  // the label is adjacent to the Apply button, not buried elsewhere
  const i = html.indexOf("Apply at");
  assert.ok(html.slice(Math.max(0, i - 700), i + 400).includes("Sponsored"), "label must be next to the button");
});

test("no label and no affiliate wording on a non-sponsored offer", async () => {
  const { detailPage } = await import("../site.js");
  const html = detailPage(ctx, "plain")!;
  assert.doesNotMatch(html, /badge-sponsored/);
  assert.doesNotMatch(html, />Sponsored</);
  assert.doesNotMatch(html, /rel="sponsored/);
});

test("Morgan C5: the disclosure comes BEFORE the click on mobile (label and notice precede the Apply button) and is not faded", async () => {
  const { detailPage } = await import("../site.js");
  const html = detailPage(ctx, "spons")!;
  assert.ok(html.indexOf("badge-sponsored") < html.indexOf('class="btn"'), "label must precede the button");
  assert.ok(html.indexOf("sponsored-note") < html.indexOf('class="btn"'), "notice must precede the button");
  const fs = await import("node:fs");
  const css = fs.readFileSync("public/assets/site.css", "utf8");
  const rule = css.match(/\.sponsored-note\s*\{[^}]*\}/)![0];
  assert.ok(!/opacity/.test(rule), "faded text fails 'clear and conspicuous'");
});
