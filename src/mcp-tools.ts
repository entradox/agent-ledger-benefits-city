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

function textResult(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] };
}

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "benefits-city", version: "0.2.0" });

  server.tool(
    "search_bonuses",
    "Search US bank account opening bonuses and credit card signup bonuses. Returns matching offers sorted by bonus amount (highest first).",
    {
      bonus_type: z
        .enum(["bank_account", "credit_card"])
        .optional()
        .describe("Restrict to bank account bonuses or credit card signup bonuses."),
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
    async (args) => textResult(searchBonuses(args)),
  );

  server.tool(
    "get_bonus",
    "Get the full detail of one bonus offer: requirements, minimum deposit, expiry date, state availability, application and source URLs, and the date the terms were last verified.",
    {
      id: z.string().describe("Bonus id, e.g. 'chase-total-checking-300'. Use search_bonuses to find ids."),
    },
    async ({ id }) => {
      const bonus = getBonusById(id);
      if (!bonus) {
        return {
          content: [{ type: "text" as const, text: `Unknown bonus id: ${id}` }],
          isError: true,
        };
      }
      return textResult(bonus);
    },
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
    async ({ days }) => textResult(expiringSoon(days)),
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
    async ({ ids }) => {
      try {
        return textResult(compareBonuses(ids));
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: (err as Error).message }],
          isError: true,
        };
      }
    },
  );

  return server;
}
