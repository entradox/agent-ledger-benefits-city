/**
 * Benefits City — shared MCP server factory.
 *
 * Both the stdio server (src/mcp-server.ts) and the Streamable HTTP transport
 * (src/web-server.ts, POST /mcp) connect through this single tool definition,
 * so the contract can never drift between transports.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { expiringSoon, getBonusById, searchBonuses } from "./db.js";
import { compareBonuses } from "./compare.js";
import { recordMcpCall } from "./metrics.js";
import { toPublic } from "./links.js";
import { SERVER_VERSION, SKILL_URI } from "./meta.js";

function textResult(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

/** Typed error envelope agents can self-correct from: {error:{type,message,code?,param?}}. */
function errorResult(type: string, message: string, param?: string, code?: string) {
  const error: Record<string, string> = { type, message };
  if (code) error.code = code;
  if (param) error.param = param;
  return { content: [{ type: "text" as const, text: JSON.stringify({ error }, null, 2) }], isError: true };
}

const SKILL_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "skill", "benefits-city", "SKILL.md");

const API_DOCS = `# Benefits City MCP
Tools: search_bonuses(bonus_type?, state?, min_bonus_amount_usd?, direct_deposit_required?, query?, limit?),
get_bonus(id), expiring_soon(days?), compare_bonuses(ids[2..4]), benefits_api_docs(), benefits_examples().
Every offer: id, bank_or_issuer, product_name, bonus_type (bank_account|credit_card|savings), bonus_amount_usd
(cards: estimated USD value of points), expiry_date, requirements[], verification{method,verified_at,sources},
last_verified_date, sponsored (bool), apply_url (tracked link), disclosure_url.
Ordering: bonus value desc, id asc — never influenced by commissions. Expired offers are never returned.
Errors: {"error":{"type","message","code?","param?"}} with isError=true.`;

const EXAMPLES = [
  { title: "Top checking bonuses without direct deposit", tool: "search_bonuses", arguments: { bonus_type: "bank_account", direct_deposit_required: false, limit: 5 } },
  { title: "What expires in the next two weeks", tool: "expiring_soon", arguments: { days: 14 } },
  { title: "Best savings bonuses in Texas", tool: "search_bonuses", arguments: { bonus_type: "savings", state: "TX" } },
  { title: "Head-to-head", tool: "compare_bonuses", arguments: { ids: ["chase-total-checking-300", "sofi-checking-savings-400"] } },
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

  server.tool(
    "search_bonuses",
    "Search US bank account opening bonuses and credit card signup bonuses. Returns matching offers sorted by bonus amount (highest first).",
    {
      bonus_type: z
        .enum(["bank_account", "credit_card", "savings"])
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
      limit: z.number().int().min(1).max(100).default(25).describe("Max results to return."),
    },
    timed("search_bonuses", async (args) => textResult(searchBonuses(args).map(toPublic))),
  );

  server.tool(
    "get_bonus",
    "Get the full detail of one bonus offer: requirements, minimum deposit, expiry date, state availability, application and source URLs, and the date the terms were last verified.",
    {
      id: z.string().describe("Bonus id, e.g. 'chase-total-checking-300'. Use search_bonuses to find ids."),
    },
    timed("get_bonus", async ({ id }) => {
      const bonus = getBonusById(id);
      if (!bonus) return errorResult("not_found", `Unknown bonus id: ${id}`, "id");
      return textResult(toPublic(bonus));
    }),
  );

  server.tool(
    "expiring_soon",
    "List bonus offers whose stated expiry date falls within the next N days, soonest expiry first. Offers with no stated end date are not included.",
    {
      days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .default(30)
        .describe("Lookahead window in days (default 30)."),
    },
    timed("expiring_soon", async ({ days }) => textResult(expiringSoon(days).map(toPublic))),
  );

  server.tool(
    "compare_bonuses",
    "Compare 2-4 bonus offers side by side. Returns each offer's key fields plus a summary naming the highest bonus and the earliest expiry.",
    {
      ids: z
        .array(z.string())
        .min(2)
        .max(4)
        .describe("2 to 4 bonus ids to compare, e.g. ['chase-total-checking-300', 'sofi-checking-savings-400']."),
    },
    timed("compare_bonuses", async ({ ids }) => {
      try {
        const r = compareBonuses(ids);
        return textResult({ ...r, bonuses: r.bonuses.map(toPublic) });
      } catch (err) {
        return errorResult("not_found", (err as Error).message, "ids");
      }
    }),
  );

  server.tool(
    "benefits_api_docs",
    "Self-serve documentation for this server: tools, record fields, ordering guarantees, error format.",
    {},
    timed("benefits_api_docs", async () => ({ content: [{ type: "text" as const, text: API_DOCS }] })),
  );

  server.tool(
    "benefits_examples",
    "Runnable example tool calls (title, tool, arguments) an agent can copy.",
    {},
    timed("benefits_examples", async () => textResult(EXAMPLES)),
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
