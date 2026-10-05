import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { setupDb } from "./helpers.js";
import { loadOfferSchema, validateJson, ROOT } from "./schema-validator.js";

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";

const schema = loadOfferSchema();
const db = await setupDb([]);
const { syncSeed } = await import("../seed.js");
const { toPublic } = await import("../links.js");

// Every record the seed/db layer produces, pushed through the real pipeline:
// seed-data/*.json -> validate() -> upsertBonus()/normalize() -> allRecords() -> toPublic().
syncSeed(path.join(ROOT, "seed-data"));
const records = db.allRecords();

test("offer-schema.v1 is draft 2020-12 and required/properties are the same set", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  const declared = Object.keys(schema.properties as object).sort();
  assert.deepEqual([...(schema.required as string[])].sort(), declared, "required must list every declared property");
});

test("schema declares exactly the keys toPublic emits (no drift, no phantom fields)", () => {
  const declared = new Set(Object.keys(schema.properties as object));
  const served = toPublic(records[0]);
  for (const key of Object.keys(served)) assert.ok(declared.has(key), `served field "${key}" is not declared in offer-schema.v1`);
  for (const key of declared) assert.ok(key in served, `schema declares "${key}" but toPublic never emits it`);
});

test("every offer the seed/db layer produces validates against offer-schema.v1", () => {
  assert.ok(records.length > 0, "seed produced no records");
  for (const b of records) {
    const errors = validateJson(toPublic(b), schema);
    assert.deepEqual(
      errors,
      [],
      `offer-schema violation in record "${b.id}":\n` + errors.map((e) => `  ${e.path}: ${e.message}`).join("\n"),
    );
  }
});

test("no served offer leaks affiliate_url (undeclared property must fail)", () => {
  for (const b of records) {
    const served = toPublic(b) as Record<string, unknown>;
    assert.ok(!("affiliate_url" in served), `record "${b.id}" leaks affiliate_url into served output`);
    // and if it ever did, the schema must catch it
    const errors = validateJson({ ...served, affiliate_url: "https://x.example/click" }, schema);
    assert.ok(
      errors.some((e) => e.path === "offer.affiliate_url" && /undeclared property/.test(e.message)),
      `schema must reject affiliate_url on record "${b.id}", got: ${JSON.stringify(errors)}`,
    );
  }
});
