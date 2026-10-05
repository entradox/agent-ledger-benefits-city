import test from "node:test";
import assert from "node:assert/strict";
import { makeBonus } from "./helpers.js";
import { loadOfferSchema, validateJson } from "./schema-validator.js";

process.env.PUBLIC_URL = "https://aiagentscity.com/benefits";

const schema = loadOfferSchema();
const { toPublic } = await import("../links.js");

// A validator that has never failed proves nothing: these tests prove it can fail.
const valid = toPublic(makeBonus({ id: "canary-offer" }));

test("validator ACCEPTS a well-formed served offer", () => {
  assert.deepEqual(validateJson(valid, schema), []);
});

test('validator REJECTS a record with "bonus_amount_usd" as a string ("600")', () => {
  const errors = validateJson({ ...valid, bonus_amount_usd: "600" }, schema);
  assert.ok(
    errors.some((e) => e.path === "offer.bonus_amount_usd" && /expected number/.test(e.message)),
    `expected a named type error at offer.bonus_amount_usd, got: ${JSON.stringify(errors)}`,
  );
});

test("validator REJECTS an undeclared property by name", () => {
  const errors = validateJson({ ...valid, surprise_field: true }, schema);
  assert.ok(
    errors.some((e) => e.path === "offer.surprise_field" && /undeclared property "surprise_field"/.test(e.message)),
    `expected a named undeclared-property error, got: ${JSON.stringify(errors)}`,
  );
});

test("validator REJECTS a missing required field", () => {
  const { id: _dropped, ...noId } = valid as Record<string, unknown>;
  const errors = validateJson(noId, schema);
  assert.ok(
    errors.some((e) => e.path === "offer.id" && /missing required property "id"/.test(e.message)),
    `expected a named missing-required error for id, got: ${JSON.stringify(errors)}`,
  );
});

test("validator REJECTS a bad nested value (verification.method)", () => {
  const errors = validateJson(
    { ...valid, verification: { method: "guessed", verified_at: "2026-10-01", sources: [] } },
    schema,
  );
  assert.ok(
    errors.some((e) => e.path === "offer.verification.method" && /expected one of/.test(e.message)),
    `expected a named enum error at offer.verification.method, got: ${JSON.stringify(errors)}`,
  );
});
