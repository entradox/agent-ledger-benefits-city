/**
 * Benefits City — shared MCP server factory.
 *
 * Both the stdio server (src/mcp-server.ts) and the Streamable HTTP transport
 * (src/web-server.ts, POST /mcp) connect through this single tool definition,
 * so the contract can never drift between transports.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { expiringSoon, getBonusById, searchBonuses } from "./db.js";
import { compareBonuses } from "./compare.js";
import { recordMcpCall } from "./metrics.js";
import { BONUS_TYPES, LIMITS, errorEnvelope } from "./contract.js";
import { toPublic } from "./links.js";
import { SERVER_VERSION, SKILL_URI } from "./meta.js";

function textResult(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

/** Typed error envelope agents can self-correct from: {error:{type,message,code?,param?}}. */
function errorResult(type: string, message: string, param?: string, code?: string) {
  return { content: [{ type: "text" as const, text: JSON.stringify(errorEnvelope(type, message, param, code), null, 2) }], isError: true };
}

const SKILL_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "skill", "benefits-city", "SKILL.md");

/* ---- OpenAI plugin tool metadata ------------------------------------------------------------
 * ChatGPT plugin review requires a `title` and three safety hints per tool, and recommends an
 * output schema so the model and the reviewer can see the result shape without calling it.
 *
 * readOnlyHint  — every tool here fetches/looks up/computes. None creates, updates, deletes,
 *                 sends, enqueues or logs. So true for all six, and destructiveHint false for all
 *                 six (no irreversible side effect exists on this server).
 * openWorldHint — true: results describe public US banking offers sourced from issuers and
 *                 aggregators on the open internet. Per ChatGPT's own worked example, web search is
 *                 openWorldHint:true even though it is read-only, so readOnly does NOT imply
 *                 bounded. This is the counter-intuitive one and it is deliberate.
 * ------------------------------------------------------------------------------------------- */
const READ_ONLY_OPEN = {
  readOnlyHint: true,
  openWorldHint: true,
  destructiveHint: false,
} as const;

/**
 * Shape of one public offer as returned by toPublic(). Mirrors the OpenAPI Bonus schema, which a
 * test asserts lists EXACTLY the fields toPublic returns — so this must stay exact, not approximate.
 */
const bonusSchema = z.object({
  id: z.string(),
  bank_or_issuer: z.string(),
  product_name: z.string(),
  bonus_type: z.enum(BONUS_TYPES),
  bonus_amount_usd: z.number(),
  bonus_points: z.number().nullable(),
  annual_fee_usd: z.number().nullable(),
  requirements: z.array(z.string()),
  min_deposit_usd: z.number().nullable(),
  direct_deposit_required: z.boolean(),
  expiry_date: z.string().nullable(),
  states_available: z.union([z.string(), z.array(z.string())]),
  application_url: z.string().nullable(),
  source_url: z.string().nullable(),
  last_verified_date: z.string().nullable(),
  offer_history: z.array(
    z.object({
      amount_usd: z.number(),
      valid_from: z.string().nullable(),
      valid_to: z.string().nullable(),
    }),
  ),
  verification: z
    .object({
      method: z.enum(["issuer_page", "aggregator_consensus"]),
      verified_at: z.string(),
      sources: z.array(z.string()),
    })
    .nullable(),
  status: z.enum(["active", "expired", "needs_review"]),
  eligibility: z
    .object({
      new_to_bank: z.boolean().nullable(),
      once_per_lifetime: z.boolean().nullable(),
      cooldown_months: z.number().nullable(),
      issuer_rules: z.array(z.string()),
    })
    .nullable(),
  sponsored: z.boolean(),
  /** OUR tracked /go/:id link. The raw affiliate URL is never published. */
  apply_url: z.string().nullable(),
  disclosure_url: z.string(),
});

const searchOutput = z.object({ bonuses: z.array(bonusSchema) });
const singleOutput = z.object({ bonus: bonusSchema });
const expiringOutput = z.object({ bonuses: z.array(bonusSchema) });
const compareOutput = z.object({
  bonuses: z.array(bonusSchema),
  summary: z.object({
    highest_bonus_usd: z.string(),
    earliest_expiry: z.string().nullable(),
  }),
});
const examplesOutput = z.object({
  examples: z.array(
    z.object({ title: z.string(), tool: z.string(), arguments: z.record(z.string(), z.unknown()) }),
  ),
});
const docsOutput = z.object({ docs: z.string() });

/**
 * A tool result that satisfies BOTH audiences.
 *
 * The SDK refuses a tool that declares `outputSchema` but returns no `structuredContent`, so the
 * structured form is mandatory. The text form is kept because it preserves the exact readable
 * payload every existing caller and test already consumes — dropping it would be a gratuitous
 * breaking change for anything that just prints `content[0].text`.
 */
function structured<T extends Record<string, unknown>>(obj: T) {
  return {
    structuredContent: obj,
    content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }],
  };
}

const API_DOCS = `# Benefits City MCP
Tools: search_bonuses(bonus_type?, state?, min_bonus_amount_usd?, direct_deposit_required?, query?, limit?),
get_bonus(id), expiring_soon(days?), compare_bonuses(ids[2..4]), benefits_api_docs(), benefits_examples().
Every offer: id, bank_or_issuer, product_name, bonus_type (bank_account|credit_card|savings), bonus_amount_usd
(cards: estimated USD value of points), expiry_date, requirements[], verification{method,verified_at,sources},
last_verified_date, sponsored (bool), apply_url (tracked link), disclosure_url.
Ordering: bonus value descending (cards at estimated USD value from published third-party valuations), id ascending as tie-break; commission is never an input. Expired offers are never returned.
Errors: {"error":{"type","message","code?","param?"}} with isError=true.`;

const EXAMPLES = [
  { title: "Top checking bonuses without direct deposit", tool: "search_bonuses", arguments: { bonus_type: "bank_account", direct_deposit_required: false, limit: 5 } },
  { title: "What expires in the next two weeks", tool: "expiring_soon", arguments: { days: 14 } },
  { title: "Best savings bonuses in Texas", tool: "search_bonuses", arguments: { bonus_type: "savings", state: "TX" } },
  { title: "Head-to-head", tool: "compare_bonuses", arguments: { ids: ["chase-total-checking-400", "sofi-checking-savings-400"] } },
];

/**
 * Wrap an MCP tool handler so every call is counted, with its latency.
 *
 * PRIVACY: `param_summary` is a whitelist of safe, non-identifying fields — enum values,
 * booleans, a numeric limit, and a count of ids. Free-text arguments (e.g. a search
 * `query`) are NEVER written; only whether one was supplied. A user's search words are
 * exactly the kind of thing that would turn this table into a PII sink.
 */
function timed<A extends Record<string, unknown>, R>(
  tool: string,
  handler: (args: A) => Promise<R>,
): (args: A) => Promise<R> {
  return async (args: A) => {
    const started = Date.now();
    try {
      return await handler(args);
    } finally {
      const parts: string[] = [];
      const a = (args ?? {}) as Record<string, unknown>;
      for (const k of ["bonus_type", "state", "direct_deposit_required", "limit", "days"]) {
        if (a[k] !== undefined && a[k] !== "") parts.push(`${k}=${String(a[k]).slice(0, 40)}`);
      }
      if (typeof a.query === "string" && a.query) parts.push(`query=supplied(${a.query.length})`);
      if (Array.isArray(a.ids)) parts.push(`ids=${a.ids.length}`);
      if (typeof a.id === "string" && a.id) parts.push(`id=supplied`);
      recordMcpCall(null, tool, Date.now() - started, parts.join(" ") || "no-params");
    }
  };
}

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "benefits-city", version: SERVER_VERSION });

  server.registerTool(
    "search_bonuses",
    {
      title: "Search bank and credit card signup bonuses",
      description:
        "Use when a user wants to find a US bank account, savings, or credit card signup bonus, or asks which offers are worth opening. Returns matching offers sorted by bonus value, highest first.",
      inputSchema: {
        bonus_type: z
          .enum(BONUS_TYPES)
          .optional()
          .describe("Restrict to bank account bonuses, credit card signup bonuses, or savings account bonuses."),
        state: z
          .string()
          .optional()
          .describe(
            "2-letter US state code, e.g. 'TX'. Nationwide offers always match; regional offers match only their states.",
          ),
        min_bonus_amount_usd: z
          .number()
          .optional()
          .describe(
            "Minimum bonus value in USD. For credit cards this is the estimated USD value of the points/miles bonus.",
          ),
        direct_deposit_required: z
          .boolean()
          .optional()
          .describe("Filter on whether the bonus requires a qualifying direct deposit."),
        query: z
          .string()
          .optional()
          .describe("Keyword matched against bank/issuer and product name, e.g. 'Chase' or 'Sapphire'."),
        limit: z.number().int().min(LIMITS.limit.min).max(LIMITS.limit.max).default(LIMITS.limit.default).describe("Max results to return."),
      },
      outputSchema: searchOutput,
      annotations: READ_ONLY_OPEN,
    },
    timed("search_bonuses", async (args) =>
      structured({ bonuses: searchBonuses(args).map(toPublic) }),
    ),
  );

  server.registerTool(
    "get_bonus",
    {
      title: "Get one bonus offer in full",
      description:
        "Use before recommending an offer, to read its exact requirements, minimum deposit, direct-deposit rules, expiry date, state availability and the date its terms were last verified. Quote the requirements rather than paraphrasing money amounts.",
      inputSchema: {
        id: z.string().describe("Bonus id, e.g. 'chase-total-checking-400'. Use search_bonuses to find ids."),
      },
      outputSchema: singleOutput,
      annotations: READ_ONLY_OPEN,
    },
    timed("get_bonus", async ({ id }) => {
      const bonus = getBonusById(id);
      if (!bonus) return errorResult("not_found", `Unknown bonus id: ${id}`, "id");
      return structured({ bonus: toPublic(bonus) });
    }),
  );

  server.registerTool(
    "expiring_soon",
    {
      title: "List bonuses expiring soon",
      description:
        "Use when timing matters — a user asking what is about to end, or whether to act now. Offers with no stated end date are never included here.",
      inputSchema: {
        days: z
          .number()
          .int()
          .min(LIMITS.days.min)
          .max(LIMITS.days.max)
          .default(LIMITS.days.default)
          .describe("Lookahead window in days (default 30)."),
      },
      outputSchema: expiringOutput,
      annotations: READ_ONLY_OPEN,
    },
    timed("expiring_soon", async ({ days }) =>
      structured({ bonuses: expiringSoon(days).map(toPublic) }),
    ),
  );

  server.registerTool(
    "compare_bonuses",
    {
      title: "Compare 2-4 bonuses side by side",
      description:
        "Use when a user is choosing between specific offers. Returns each offer's key fields plus a summary naming the highest bonus and the earliest expiry.",
      inputSchema: {
        ids: z
          .array(z.string())
          .min(LIMITS.ids.min)
          .max(LIMITS.ids.max)
          .describe(
            "2 to 4 bonus ids to compare, e.g. ['chase-total-checking-400', 'sofi-checking-savings-400'].",
          ),
      },
      outputSchema: compareOutput,
      annotations: READ_ONLY_OPEN,
    },
    timed("compare_bonuses", async ({ ids }) => {
      try {
        const r = compareBonuses(ids);
        return structured({ ...r, bonuses: r.bonuses.map(toPublic) });
      } catch (err) {
        return errorResult("not_found", (err as Error).message, "ids");
      }
    }),
  );

  server.registerTool(
    "benefits_api_docs",
    {
      title: "Read this server's documentation",
      description:
        "Use when you need field definitions, ordering guarantees or the error format before calling another tool.",
      inputSchema: {},
      outputSchema: docsOutput,
      annotations: READ_ONLY_OPEN,
    },
    timed("benefits_api_docs", async () => structured({ docs: API_DOCS })),
  );

  server.registerTool(
    "benefits_examples",
    {
      title: "Get runnable example calls",
      description: "Use to copy a working example call instead of guessing tool arguments.",
      inputSchema: {},
      outputSchema: examplesOutput,
      annotations: READ_ONLY_OPEN,
    },
    timed("benefits_examples", async () => structured({ examples: EXAMPLES })),
  );

  server.resource(
    "benefits-skill",
    SKILL_URI,
    { mimeType: "text/markdown", description: "How to finish the job with Benefits City" },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: fs.readFileSync(SKILL_FILE, "utf8") }],
    }),
  );

  return server;
}

export interface McpToolInfo {
  name: string;
  title?: string;
  description?: string;
  inputSchema: unknown;
  outputSchema?: unknown;
  annotations?: Record<string, unknown>;
}

let toolsCache: McpToolInfo[] | null = null;

/** The live tool list, read from the real server over an in-memory MCP client. server-card.json and
 *  the OpenAPI/docs are generated from this, so they cannot drift from what the server serves. */
export async function describeMcpTools(): Promise<McpToolInfo[]> {
  if (toolsCache) return toolsCache;
  const [a, b] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer();
  await server.connect(a);
  const client = new Client({ name: "manifest", version: "0" });
  await client.connect(b);
  const tools = (await client.listTools()).tools.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    outputSchema: t.outputSchema,
    annotations: t.annotations as Record<string, unknown> | undefined,
  }));
  await client.close();
  await server.close();
  toolsCache = tools;
  return tools;
}
