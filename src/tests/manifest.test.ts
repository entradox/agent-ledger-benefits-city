import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { iso, makeBonus, setupDb } from "./helpers.js";

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";
await setupDb([makeBonus({ id: "a", expiry_date: iso(10) })]);
const { agentJson, serverCard } = await import("../meta.js");
const { createMcpServer, describeMcpTools } = await import("../mcp-tools.js");
const U = "https://aiagentscity.com/benefits";

test("agent.json: city schema, honest auth/pricing (none/free), every capability endpoint is a real REST route", () => {
  const a = agentJson(U) as Record<string, any>;
  assert.equal(a.schema_version, "1.0");
  assert.equal(a.name, "Benefits City");
  assert.equal(a.url, U);
  assert.equal(a.openapi, `${U}/openapi.json`);
  assert.equal(a.auth.type, "none");
  assert.equal(a.pricing.model, "free");
  assert.equal(a.pricing.amount_usd, 0);
  assert.equal(a.contact, "bonuses@aiagentscity.com");
  assert.equal(a.mcp.url, `${U}/mcp`);
  const ends = a.capabilities.map((c: { endpoint: string }) => c.endpoint);
  for (const e of ["/api/search", "/api/expiring", "/api/compare", "/api/bonuses/{id}", "/api/stats"])
    assert.ok(ends.includes(e), e);
  for (const c of a.capabilities) {
    assert.equal(c.method, "GET");
    assert.equal(c.free, true);
    assert.ok(c.id && c.description);
  }
  // no overclaiming: nothing that implies keys, payment, or write access
  const text = JSON.stringify(a).toLowerCase();
  for (const bad of ["api_key", "x402", "stripe", "workspace_key", "\"post\""]) assert.ok(!text.includes(bad), bad);
});

test("server-card tools are generated from the live MCP server (no drift)", async () => {
  const tools = await describeMcpTools();
  const [x, y] = InMemoryTransport.createLinkedPair();
  await createMcpServer().connect(x);
  const c = new Client({ name: "t", version: "0" });
  await c.connect(y);
  const live = (await c.listTools()).tools;
  assert.deepEqual(tools.map((t) => t.name).sort(), live.map((t) => t.name).sort());
  const byName = new Map(live.map((t) => [t.name, t]));
  for (const t of tools) {
    assert.equal(t.description, byName.get(t.name)!.description);
    assert.deepEqual(t.inputSchema, byName.get(t.name)!.inputSchema);
  }
  const card = serverCard(U, tools) as Record<string, any>;
  assert.equal(card.serverInfo.name, "Benefits City");
  assert.equal(card.authentication.required, false);
  assert.equal(card.tools.length, live.length);
  assert.equal(card.resources[0].uri, "skill://benefits-city/benefits-city/SKILL.md");
});
