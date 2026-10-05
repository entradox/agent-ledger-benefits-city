/**
 * Benefits City — OpenAPI 3.1 description of the REST surface.
 * Drift is guarded by src/tests/openapi.test.ts (parameter names vs the MCP tool schemas, Bonus
 * fields vs toPublic(), capability endpoints vs paths) and by an HTTP test that requests every path.
 */
import { BONUS_TYPES, LIMITS, STATE_NAMES } from "./contract.js";
import { SERVER_VERSION } from "./meta.js";

const errorRef = { $ref: "#/components/schemas/Error" };
const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: errorRef } },
});
const bonusArray = { type: "array", items: { $ref: "#/components/schemas/Bonus" } };
const json = (schema: unknown) => ({ "application/json": { schema } });

const nullableString = { type: ["string", "null"] };

export function openapiJson(publicUrl: string): object {
  return {
    openapi: "3.1.0",
    info: {
      title: "Benefits City API",
      version: SERVER_VERSION,
      description:
        "Read-only, no-auth API for US bank-account, savings and credit-card signup bonuses. Same data and ordering as the MCP tools (value descending, never influenced by commission). Errors use {error:{type,message,code?,param?}}.",
      contact: { email: "bonuses@aiagentscity.com" },
    },
    servers: [{ url: publicUrl }],
    paths: {
      "/api/search": {
        get: {
          operationId: "searchBonuses",
          summary: "Search offers (same filters as the MCP search_bonuses tool)",
          parameters: [
            { name: "bonus_type", in: "query", schema: { type: "string", enum: [...BONUS_TYPES] } },
            { name: "state", in: "query", description: "2-letter US state code (case-insensitive); nationwide offers always match", schema: { type: "string", enum: Object.keys(STATE_NAMES) } },
            { name: "min_bonus_amount_usd", in: "query", description: "Cards: estimated USD value of points", schema: { type: "number", minimum: 0 } },
            { name: "direct_deposit_required", in: "query", schema: { type: "boolean" } },
            { name: "query", in: "query", description: "Keyword on bank/issuer and product name", schema: { type: "string", maxLength: LIMITS.query.max } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: LIMITS.limit.min, maximum: LIMITS.limit.max, default: LIMITS.limit.default } },
          ],
          responses: {
            "200": { description: "Offers, highest bonus first", content: json(bonusArray) },
            "400": errorResponse("invalid_param — names the offending parameter"),
          },
        },
      },
      "/api/expiring": {
        get: {
          operationId: "expiringSoon",
          summary: "Offers expiring within N days, soonest first",
          parameters: [{ name: "days", in: "query", schema: { type: "integer", minimum: LIMITS.days.min, maximum: LIMITS.days.max, default: LIMITS.days.default } }],
          responses: {
            "200": { description: "Offers with a stated expiry inside the window", content: json(bonusArray) },
            "400": errorResponse("invalid_param"),
          },
        },
      },
      "/api/compare": {
        get: {
          operationId: "compareBonuses",
          summary: "Compare 2 to 4 offers",
          parameters: [
            { name: "ids", in: "query", required: true, description: `Comma-separated, ${LIMITS.ids.min} to ${LIMITS.ids.max} distinct ids`, schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "The offers plus a summary naming the highest bonus and earliest expiry",
              content: json({
                type: "object",
                properties: {
                  bonuses: { type: "array", items: { $ref: "#/components/schemas/Bonus" } },
                  summary: {
                    type: "object",
                    properties: { highest_bonus_usd: { type: "string" }, earliest_expiry: nullableString },
                  },
                },
              }),
            },
            "400": errorResponse("invalid_param — wrong id count or duplicates"),
            "404": errorResponse("not_found — an id is unknown or expired"),
          },
        },
      },
      "/api/bonuses/{id}": {
        get: {
          operationId: "getBonus",
          summary: "One offer",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "The offer", content: json({ $ref: "#/components/schemas/Bonus" }) },
            "404": errorResponse("not_found"),
          },
        },
      },
      "/api/bonuses.json": {
        get: {
          operationId: "listBonuses",
          summary: "Every currently served offer",
          responses: { "200": { description: "All offers", content: json(bonusArray) } },
        },
      },
      "/api/insights": {
        get: {
          operationId: "getInsights",
          summary: "Original statistics computed live from the served offers (counts, medians, shares) with denominators and an as_of date",
          responses: { "200": { description: "Insights", content: json({ type: "object", additionalProperties: true }) } },
        },
      },
      "/api/stats": {
        get: {
          operationId: "getStats",
          summary: "Live counts and totals",
          responses: { "200": { description: "Stats", content: json({ type: "object", additionalProperties: true }) } },
        },
      },
      "/go/{id}": {
        get: {
          operationId: "applyRedirect",
          summary: "Tracked apply link: 302 to the issuer (or partner) page. Use apply_url from an offer.",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "302": { description: "Redirect to the offer page" }, "404": { description: "Unknown or expired offer" } },
        },
      },
    },
    components: {
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["type", "message"],
              properties: {
                type: { type: "string", examples: ["invalid_param", "not_found"] },
                message: { type: "string" },
                code: { type: "string" },
                param: { type: "string" },
              },
            },
          },
        },
        Bonus: {
          type: "object",
          required: ["id", "bank_or_issuer", "product_name", "bonus_type", "bonus_amount_usd"],
          properties: {
            id: { type: "string" },
            bank_or_issuer: { type: "string" },
            product_name: { type: "string" },
            bonus_type: { type: "string", enum: [...BONUS_TYPES] },
            bonus_amount_usd: { type: "number", description: "Cards: estimated USD value of points" },
            bonus_max_usd: { type: "number", nullable: true, description: "Top tier of a tiered offer; bonus_amount_usd is the value the stated requirements earn" },
            bonus_points: { type: ["number", "null"] },
            annual_fee_usd: { type: ["number", "null"] },
            requirements: { type: "array", items: { type: "string" } },
            min_deposit_usd: { type: ["number", "null"] },
            direct_deposit_required: { type: "boolean" },
            expiry_date: { type: ["string", "null"], description: "YYYY-MM-DD (US Eastern) or null" },
            states_available: { oneOf: [{ type: "string", const: "nationwide" }, { type: "array", items: { type: "string" } }] },
            application_url: nullableString,
            source_url: nullableString,
            last_verified_date: nullableString,
            offer_history: { type: "array", items: { type: "object" } },
            verification: { type: ["object", "null"], description: "{method: issuer_page|aggregator_consensus, verified_at, sources[]}" },
            status: { type: "string", enum: ["active", "expired", "needs_review"] },
            eligibility: { type: ["object", "null"] },
            sponsored: { type: "boolean", description: "True when the apply link is an affiliate link" },
            apply_url: { ...nullableString, description: "Our tracked /go link" },
            disclosure_url: { type: "string" },
          },
        },
      },
    },
  };
}
