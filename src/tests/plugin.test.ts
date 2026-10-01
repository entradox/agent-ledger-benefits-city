/**
 * Benefits City — ChatGPT plugin readiness (D-1530).
 *
 * Reviewers reject a plugin whose tool metadata does not match behaviour, so these are written as
 * drift guards, not decoration: add a tool without annotations and the suite goes red.
 *
 * Canary note (do not delete): each assertion below was checked to FAIL when its field is removed
 * from src/mcp-tools.ts. A guard that cannot fail is theatre.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { makeBonus, setupDb } from "./helpers.js";

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";
await setupDb([
  makeBonus({ id: "one", bonus_amount_usd: 500, affiliate_url: "https://partner.example/one" }),
  makeBonus({ id: "two", bonus_amount_usd: 400 }),
  makeBonus({ id: "no-expiry-a", bonus_amount_usd: 300, expiry_date: null }),
  makeBonus({ id: "no-expiry-b", bonus_amount_usd: 200, expiry_date: null }),
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

const EXPECTED = [
  "search_bonuses",
  "get_bonus",
  "expiring_soon",
  "compare_bonuses",
  "benefits_api_docs",
  "benefits_examples",
];

test("every tool carries a title and all three OpenAI safety hints", async () => {
  const c = await connect();
  const tools = (await c.listTools()).tools;
  const byName = new Map(tools.map((t) => [t.name, t]));
  for (const n of EXPECTED) {
    const t = byName.get(n);
    assert.ok(t, `tool ${n} missing`);
    assert.ok(t.title && t.title.length > 0, `${n} has no title`);
    const a = (t.annotations ?? {}) as Record<string, unknown>;
    assert.equal(a.readOnlyHint, true, `${n} readOnlyHint`);
    assert.equal(a.openWorldHint, true, `${n} openWorldHint`);
    assert.equal(a.destructiveHint, false, `${n} destructiveHint`);
  }
});

test("every tool declares an output schema, and no tool advertises a schema it does not return", async () => {
  const c = await connect();
  const tools = (await c.listTools()).tools;
  for (const t of tools) {
    assert.ok(t.outputSchema, `${t.name} has no outputSchema`);
  }
  // Declaring an outputSchema obliges the server to return structuredContent (SDK enforces this,
  // so this test is the early warning rather than the failure).
  const r = await c.callTool({ name: "search_bonuses", arguments: {} });
  assert.ok((r as { structuredContent?: unknown }).structuredContent, "search_bonuses returned no structuredContent");
});

test("structuredContent and content agree (the readable payload is not lost)", async () => {
  const c = await connect();
  const r = (await c.callTool({ name: "search_bonuses", arguments: {} })) as {
    structuredContent?: { bonuses: { id: string }[] };
    content: { text: string }[];
  };
  assert.deepEqual(r.structuredContent?.bonuses.map((b) => b.id), ["one", "two", "no-expiry-a", "no-expiry-b"]);
  // content[0].text is the same JSON — existing text-only callers keep working.
  assert.deepEqual(
    JSON.parse(r.content[0].text).bonuses.map((b: { id: string }) => b.id),
    ["one", "two", "no-expiry-a", "no-expiry-b"],
  );
  assert.ok(!r.content[0].text.includes("partner.example"), "affiliate_url must never be published");
});

test("compare_bonuses summary matches the real Comparison shape", async () => {
  const c = await connect();
  const r = (await c.callTool({
    name: "compare_bonuses",
    arguments: { ids: ["one", "two"] },
  })) as { structuredContent?: { summary: { highest_bonus_usd: string; earliest_expiry: string | null } } };
  // Both fixtures carry a future expiry, so there is a real earliest — and it is reported as the
  // offer ID (same convention as highest_bonus_usd), not a date.
  assert.equal(r.structuredContent?.summary.highest_bonus_usd, "one");
  assert.equal(r.structuredContent?.summary.earliest_expiry, "one");
});

test("earliest_expiry is null when no compared offer states an end date", async () => {
  const c = await connect();
  const r = (await c.callTool({
    name: "compare_bonuses",
    arguments: { ids: ["no-expiry-a", "no-expiry-b"] },
  })) as { structuredContent?: { summary: { earliest_expiry: string | null } } };
  assert.equal(r.structuredContent?.summary.earliest_expiry, null);
});

test("examples tool returns the declared {examples:[...]} object", async () => {
  const c = await connect();
  const r = (await c.callTool({ name: "benefits_examples", arguments: {} })) as {
    structuredContent?: { examples: { tool: string }[] };
  };
  const ex = r.structuredContent?.examples;
  assert.ok(Array.isArray(ex) && ex.length >= 3 && ex[0].tool);
});
