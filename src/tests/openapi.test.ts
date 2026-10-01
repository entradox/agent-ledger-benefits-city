import test from "node:test";
import assert from "node:assert/strict";
import { iso, makeBonus, setupDb } from "./helpers.js";

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";
await setupDb([makeBonus({ id: "a", expiry_date: iso(10) })]);
const U = "https://aiagentscity.com/benefits";
const { openapiJson } = await import("../openapi.js");
const { agentJson, SERVER_VERSION } = await import("../meta.js");
const { describeMcpTools } = await import("../mcp-tools.js");
const { toPublic } = await import("../links.js");
const doc = openapiJson(U) as Record<string, any>;

test("openapi 3.1 envelope: version, server url, info", () => {
  assert.equal(doc.openapi, "3.1.0");
  assert.equal(doc.info.version, SERVER_VERSION);
  assert.equal(doc.servers[0].url, U);
  assert.ok(doc.info.title && doc.info.description);
});

test("every agent.json capability endpoint is documented, and every path declares the typed error response", () => {
  for (const c of (agentJson(U) as any).capabilities) assert.ok(doc.paths[c.endpoint.replace(U, "")], c.endpoint);
  for (const [p, item] of Object.entries<any>(doc.paths)) {
    if (p === "/go/{id}") continue; // redirect
    const responses = item.get.responses;
    assert.ok(responses["200"], `${p} 200`);
    if (p !== "/api/bonuses.json" && p !== "/api/stats") assert.ok(responses["400"] || responses["404"], `${p} error response`);
  }
  assert.equal(doc.components.schemas.Error.properties.error.required.includes("type"), true);
});

test("search/expiring/compare query parameters match the MCP tool input schemas (no drift)", async () => {
  const tools = new Map((await describeMcpTools()).map((t) => [t.name, t.inputSchema as any]));
  const names = (p: string) => doc.paths[p].get.parameters.map((x: { name: string }) => x.name).sort();
  assert.deepEqual(names("/api/search"), Object.keys(tools.get("search_bonuses").properties).sort());
  assert.deepEqual(names("/api/expiring"), Object.keys(tools.get("expiring_soon").properties).sort());
  assert.deepEqual(names("/api/compare"), ["ids"]); // MCP takes ids[], REST takes ?ids=a,b
  const typeEnum = doc.paths["/api/search"].get.parameters.find((x: any) => x.name === "bonus_type").schema.enum;
  assert.deepEqual([...typeEnum].sort(), [...tools.get("search_bonuses").properties.bonus_type.enum].sort());
});

test("Bonus schema lists exactly the fields toPublic returns (and never affiliate_url)", () => {
  const keys = Object.keys(toPublic(makeBonus())).sort();
  assert.deepEqual(Object.keys(doc.components.schemas.Bonus.properties).sort(), keys);
  assert.ok(!("affiliate_url" in doc.components.schemas.Bonus.properties));
});
