/**
 * Dependency-free validator for docs/schema/offer-schema.v1.json.
 *
 * Deliberately minimal: it implements exactly the JSON Schema draft 2020-12 vocabulary the
 * offer schema uses — type (including ["x","null"]), enum, const, pattern, required,
 * properties, additionalProperties:false, items, oneOf — and nothing else. ajv is not a
 * declared dependency of this project, so the contract test cannot lean on it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const OFFER_SCHEMA_PATH = path.join(ROOT, "docs", "schema", "offer-schema.v1.json");

export interface SchemaError {
  /** dotted location inside the record, e.g. "offer.verification.method" */
  path: string;
  message: string;
}

type Schema = Record<string, unknown>;

const TYPE_CHECKS: Record<string, (v: unknown) => boolean> = {
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number" && !Number.isNaN(v),
  integer: (v) => Number.isInteger(v),
  boolean: (v) => typeof v === "boolean",
  array: Array.isArray,
  object: (v) => typeof v === "object" && v !== null && !Array.isArray(v),
  null: (v) => v === null,
};

const describe = (v: unknown): string =>
  v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "object" ? "object" : JSON.stringify(v);

export function loadOfferSchema(): Schema {
  return JSON.parse(fs.readFileSync(OFFER_SCHEMA_PATH, "utf8")) as Schema;
}

export function validateJson(value: unknown, schema: Schema, where = "offer"): SchemaError[] {
  const errors: SchemaError[] = [];

  if (Array.isArray(schema.oneOf)) {
    const matches = (schema.oneOf as Schema[]).filter((s) => validateJson(value, s, where).length === 0);
    if (matches.length !== 1)
      errors.push({
        path: where,
        message: `expected exactly one matching shape, matched ${matches.length} (value ${describe(value)})`,
      });
  }

  if ("const" in schema && value !== schema.const)
    errors.push({ path: where, message: `expected constant ${JSON.stringify(schema.const)}, got ${describe(value)}` });

  if (Array.isArray(schema.enum) && !(schema.enum as unknown[]).includes(value))
    errors.push({
      path: where,
      message: `expected one of ${(schema.enum as unknown[]).map((x) => JSON.stringify(x)).join(", ")}, got ${describe(value)}`,
    });

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string];
    if (!types.some((t) => TYPE_CHECKS[t]?.(value))) {
      errors.push({ path: where, message: `expected ${types.join(" | ")}, got ${describe(value)}` });
      return errors; // deeper keywords assume the declared type
    }
  }

  if (typeof value === "string" && typeof schema.pattern === "string" && !new RegExp(schema.pattern).test(value))
    errors.push({ path: where, message: `string ${JSON.stringify(value)} does not match ${schema.pattern}` });

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const props = (schema.properties ?? {}) as Record<string, Schema>;
    for (const key of (schema.required ?? []) as string[])
      if (!(key in value)) errors.push({ path: `${where}.${key}`, message: `missing required property "${key}"` });
    for (const [key, v] of Object.entries(value)) {
      if (key in props) errors.push(...validateJson(v, props[key], `${where}.${key}`));
      else if (schema.additionalProperties === false)
        errors.push({ path: `${where}.${key}`, message: `undeclared property "${key}" — not in offer-schema.v1` });
    }
  }

  if (Array.isArray(value) && schema.items !== undefined)
    value.forEach((item, i) => errors.push(...validateJson(item, schema.items as Schema, `${where}[${i}]`)));

  return errors;
}
