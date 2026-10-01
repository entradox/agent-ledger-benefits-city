/**
 * Benefits City — the one place the API contract's shared rules live.
 * MCP (mcp-tools.ts), REST (rest.ts), OpenAPI (openapi.ts), the store (db.ts) and the seed
 * validator (seed.ts) all import from here, so a bound or an error shape cannot drift between them.
 * Parameter NAMES are tied across MCP and REST by a test (rest.test.ts "I-2 guard").
 */

export const BONUS_TYPES = ["bank_account", "credit_card", "savings"] as const;

export const LIMITS = {
  limit: { min: 1, max: 100, default: 25 },
  days: { min: 1, max: 365, default: 30 },
  ids: { min: 2, max: 4 },
  query: { max: 100 },
} as const;

/** The typed error envelope: {"error":{"type","message","code?","param?"}}. */
export function errorEnvelope(type: string, message: string, param?: string, code?: string): { error: Record<string, string> } {
  const error: Record<string, string> = { type, message };
  if (code) error.code = code;
  if (param) error.param = param;
  return { error };
}
