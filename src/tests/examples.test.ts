import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { STATE_NAMES } from "../contract.js";
import { setupDb } from "./helpers.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The shipped seed data — the same records `npm run seed` serves in production. */
const seed = [
  ...JSON.parse(fs.readFileSync(path.join(ROOT, "seed-data", "bank-account-bonuses.json"), "utf8")),
  ...JSON.parse(fs.readFileSync(path.join(ROOT, "seed-data", "credit-card-bonuses.json"), "utf8")),
  ...JSON.parse(fs.readFileSync(path.join(ROOT, "seed-data", "savings-bonuses.json"), "utf8")),
];

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";
await setupDb(seed);

const { createMcpServer, exampleArgsForTest } = await import("../mcp-tools.js");

async function connect() {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer();
  await server.connect(a);
  const client = new Client({ name: "t", version: "0" });
  await client.connect(b);
  return client;
}

const textOf = (r: unknown) => (r as { content: { text: string }[] }).content[0].text;

const call = async (
  c: Awaited<ReturnType<typeof connect>>,
  ex: { tool: string; arguments: Record<string, unknown> },
) => {
  const raw = textOf(await c.callTool({ name: ex.tool, arguments: ex.arguments }));
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`RAW RESPONSE for ${ex.tool} ${JSON.stringify(ex.arguments)}: ${raw.slice(0, 300)}`);
  }
};

// A published example that returns nothing is worse than no example: an agent reads it, calls it,
// gets an empty list, and concludes the dataset is empty. The site's "Try asking" prompts and the
// MCP examples must all be answerable by the data we actually ship.
test("every published search example returns real offers against the shipped seed", async () => {
  const c = await connect();
  const searches = exampleArgsForTest.filter((e) => e.tool === "search_bonuses");
  assert.ok(searches.length >= 2, "expected the published examples to include search calls");
  for (const ex of searches) {
    const res = (await call(c, ex)).bonuses;
    assert.ok(
      Array.isArray(res) && res.length > 0,
      `example "${ex.title}" returned nothing against the shipped seed — fix the example, not just the copy`,
    );
  }
});

test("every published expiry example is satisfied by real offers expiring in its window", async () => {
  const c = await connect();
  const expiring = exampleArgsForTest.filter((e) => e.tool === "expiring_soon");
  assert.ok(expiring.length >= 1);
  const soonest = seed
    .map((r: { expiry_date: string | null }) => r.expiry_date)
    .filter((d: string | null): d is string => Boolean(d))
    .sort()[0];
  const windowDays = Math.ceil(
    (Date.parse(`${soonest}T00:00:00Z`) - Date.now()) / 86_400_000,
  );
  for (const ex of expiring) {
    const days = Number(ex.arguments.days);
    assert.ok(
      days >= windowDays,
      `the published "${ex.title}" example asks for the next ${days} days, but the seed's nearest ` +
        `expiry is ${soonest} (${windowDays} days out) — the example would ship empty`,
    );
    const res = (await call(c, ex)).bonuses;
    assert.ok(
      Array.isArray(res) && res.length > 0,
      `example "${ex.title}" returned nothing against the shipped seed`,
    );
  }
});

// The site copy is the same promise in a different place. Keep it in sync with the data.
test("the site's published 'Try asking' prompts are answerable by the shipped seed", async () => {
  const siteSrc = fs.readFileSync(path.join(ROOT, "src", "site.ts"), "utf8");
  const prompts = [...siteSrc.matchAll(/<li>“([^”]+)”<\/li>/g)].map((m) => m[1]);
  assert.ok(prompts.length >= 3, "expected the site's Try asking list to publish prompts");
  const c = await connect();
  for (const p of prompts) {
    const stateName = p.match(/\bin ([A-Z][a-z]+(?: [A-Z][a-z]+)?)\b/)?.[1];
    const state = Object.entries(STATE_NAMES).find(([, name]) => name === stateName)?.[0];
    const type: string | undefined = /checking|bank account/i.test(p)
      ? "bank_account"
      : /savings/i.test(p)
        ? "savings"
        : /credit card/i.test(p)
          ? "credit_card"
          : undefined;
    if (!type) continue; // non-search prompts (changelog, compare) are covered elsewhere
    const args: Record<string, unknown> = { bonus_type: type, limit: 5 };
    if (state) args.state = state;
    const res = (await call(c, { tool: "search_bonuses", arguments: args })).bonuses;
    assert.ok(
      Array.isArray(res) && res.length > 0,
      `site prompt "${p}" returns nothing (${JSON.stringify(args)}) — rewrite the prompt or fix the data`,
    );
  }
});
