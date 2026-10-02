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

/** US states + DC: the only values a `state` filter accepts. */
export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

export function isUsStateCode(v: string): boolean {
  return /^[A-Za-z]{2}$/.test(v) && Object.hasOwn(STATE_NAMES, v.toUpperCase());
}

/** The typed error envelope: {"error":{"type","message","code?","param?"}}. */
export function errorEnvelope(type: string, message: string, param?: string, code?: string): { error: Record<string, string> } {
  const error: Record<string, string> = { type, message };
  if (code) error.code = code;
  if (param) error.param = param;
  return { error };
}
