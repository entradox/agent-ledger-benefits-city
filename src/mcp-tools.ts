/**
 * Benefits City — shared MCP server factory.
 *
 * Both the stdio server (src/mcp-server.ts) and the Streamable HTTP transport
 * (src/web-server.ts, POST /mcp) connect through this single tool definition,
 * so the contract can never drift between transports.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { expiringSoon, getBonusById, searchBonuses } from "./db.js";
import { compareBonuses } from "./compare.js";
import { recordMcpCall } from "./metrics.js";

function textResult(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

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
  const server = new McpServer({ name: "benefits-city", version: "0.2.0" });

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
    timed("search_bonuses", async (args) => textResult(searchBonuses(args))),
  );

  server.tool(
    "get_bonus",
    "Get the full detail of one bonus offer: requirements, minimum deposit, expiry date, state availability, application and source URLs, and the date the terms were last verified.",
    {
      id: z.string().describe("Bonus id, e.g. 'chase-total-checking-300'. Use search_bonuses to find ids."),
    },
    timed("get_bonus", async ({ id }) => {
      const bonus = getBonusById(id);
      if (!bonus) {
        return {
          content: [{ type: "text" as const, text: `Unknown bonus id: ${id}` }],
          isError: true,
        };
      }
      return textResult(bonus);
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
    timed("expiring_soon", async ({ days }) => textResult(expiringSoon(days))),
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
        return textResult(compareBonuses(ids));
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: (err as Error).message }],
          isError: true,
        };
      }
    }),
  );

  return server;
}
