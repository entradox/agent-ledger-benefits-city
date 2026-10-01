/**
 * Benefits City — REST handlers with parity to the MCP tools (PURE: no http, no globals).
 * Same data functions, same public shaping, same typed error envelope as MCP:
 *   {"error":{"type","message","code?","param?"}}
 * A malformed VALUE for a known parameter is a 400 naming it (never a 500). Unknown parameter names are ignored.
 */
import { compareBonuses } from "./compare.js";
import { BONUS_TYPES, LIMITS, errorEnvelope } from "./contract.js";
import { expiringSoon, getBonusById, searchBonuses, type SearchFilters } from "./db.js";
import { toPublic } from "./links.js";
import type { BonusType } from "./types.js";

export interface RestResult {
  status: number;
  body: unknown;
}

export function restError(status: number, type: string, message: string, param?: string, code?: string): RestResult {
  return { status, body: errorEnvelope(type, message, param, code) };
}

const badParam = (param: string, message: string) => restError(400, "invalid_param", message, param);

/** Parse an integer in [min,max]; null when absent (caller applies a documented default). */
function intParam(sp: URLSearchParams, name: string, min: number, max: number): number | null | RestResult {
  const raw = sp.get(name);
  if (raw === null || raw === "") return null;
  if (!/^-?\d+$/.test(raw)) return badParam(name, `${name} must be an integer`);
  const n = Number(raw);
  if (n < min || n > max) return badParam(name, `${name} must be between ${min} and ${max}`);
  return n;
}

const isResult = (v: unknown): v is RestResult => typeof v === "object" && v !== null && "status" in v;

export function restSearch(sp: URLSearchParams): RestResult {
  const f: SearchFilters = {};
  const type = sp.get("bonus_type");
  if (type) {
    if (!(BONUS_TYPES as readonly string[]).includes(type)) return badParam("bonus_type", `bonus_type must be one of ${BONUS_TYPES.join(", ")}`);
    f.bonus_type = type as BonusType;
  }
  const state = sp.get("state");
  if (state) {
    if (!/^[A-Za-z]{2}$/.test(state)) return badParam("state", "state must be a 2-letter US state code, e.g. TX");
    f.state = state;
  }
  const min = sp.get("min_bonus_amount_usd");
  if (min !== null && min !== "") {
    if (!/^\d+(\.\d+)?$/.test(min)) return badParam("min_bonus_amount_usd", "min_bonus_amount_usd must be a non-negative number");
    f.min_bonus_amount_usd = Number(min);
  }
  const dd = sp.get("direct_deposit_required");
  if (dd !== null && dd !== "") {
    if (dd !== "true" && dd !== "false") return badParam("direct_deposit_required", "direct_deposit_required must be true or false");
    f.direct_deposit_required = dd === "true";
  }
  const query = sp.get("query");
  if (query) {
    if (query.length > LIMITS.query.max) return badParam("query", `query must be ${LIMITS.query.max} characters or fewer`);
    f.query = query;
  }
  const limit = intParam(sp, "limit", LIMITS.limit.min, LIMITS.limit.max);
  if (isResult(limit)) return limit;
  if (limit !== null) f.limit = limit;
  return { status: 200, body: searchBonuses(f).map(toPublic) };
}

export function restExpiring(sp: URLSearchParams): RestResult {
  const days = intParam(sp, "days", LIMITS.days.min, LIMITS.days.max);
  if (isResult(days)) return days;
  return { status: 200, body: expiringSoon(days ?? LIMITS.days.default).map(toPublic) };
}

export function restCompare(sp: URLSearchParams): RestResult {
  const ids = (sp.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length < LIMITS.ids.min || ids.length > LIMITS.ids.max)
    return badParam("ids", `ids must list ${LIMITS.ids.min} to ${LIMITS.ids.max} comma-separated bonus ids`);
  if (new Set(ids).size !== ids.length) return badParam("ids", "ids must be distinct");
  try {
    const r = compareBonuses(ids);
    return { status: 200, body: { ...r, bonuses: r.bonuses.map(toPublic) } };
  } catch (e) {
    return restError(404, "not_found", (e as Error).message, "ids");
  }
}

export function restById(id: string): RestResult {
  const b = getBonusById(id);
  return b ? { status: 200, body: toPublic(b) } : restError(404, "not_found", `Unknown bonus id: ${id}`, "id");
}
