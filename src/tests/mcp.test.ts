import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { iso, makeBonus, setupDb } from "./helpers.js";

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";
await setupDb([
  makeBonus({ id: "one", bonus_amount_usd: 500, affiliate_url: "https://partner.example/one" }),
  makeBonus({ id: "two", bonus_amount_usd: 400 }),
  makeBonus({ id: "old", bonus_amount_usd: 900, expiry_date: iso(-3) }),
]);
const { createMcpServer } = await import("../mcp-tools.js");

async function connect() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer();
  await server.connect(a);
  const client = new Client({ name: "t", version: "0" });
  await client.connect(b);
  return client;
}
const text = (r: unknown) => (r as { content: { text: string }[] }).content[0].text;

test("tools list includes docs + examples; outputs are public-shaped and never expose affiliate_url", async () => {
  const c = await connect();
  const names = (await c.listTools()).tools.map((t) => t.name);
  for (const n of ["search_bonuses", "get_bonus", "expiring_soon", "compare_bonuses", "benefits_api_docs", "benefits_examples"])
    assert.ok(names.includes(n), n);
  const res = JSON.parse(text(await c.callTool({ name: "search_bonuses", arguments: {} })));
  assert.deepEqual(res.map((r: { id: string }) => r.id), ["one", "two"]); // expired 'old' absent
  assert.equal(res[0].sponsored, true);
  assert.equal(res[0].apply_url, "https://aiagentscity.com/benefits/go/one");
  assert.ok(!JSON.stringify(res).includes("partner.example"));
});

test("errors use the typed envelope", async () => {
  const c = await connect();
  const r = await c.callTool({ name: "get_bonus", arguments: { id: "nope" } });
  assert.equal((r as { isError?: boolean }).isError, true);
  const e = JSON.parse(text(r)).error;
  assert.equal(e.type, "not_found");
  assert.equal(e.param, "id");
  assert.match(e.message, /nope/);
  const r2 = await c.callTool({ name: "compare_bonuses", arguments: { ids: ["one", "ghost"] } });
  assert.equal(JSON.parse(text(r2)).error.type, "not_found");
});

test("docs/examples tools and the skill resource are served", async () => {
  const c = await connect();
  assert.match(text(await c.callTool({ name: "benefits_api_docs", arguments: {} })), /search_bonuses/);
  const ex = JSON.parse(text(await c.callTool({ name: "benefits_examples", arguments: {} })));
  assert.ok(Array.isArray(ex) && ex.length >= 3 && ex[0].tool);
  const skill = await c.readResource({ uri: "skill://benefits-city/benefits-city/SKILL.md" });
  assert.match((skill.contents[0] as { text: string }).text, /^---\nname: benefits-city/);
});
