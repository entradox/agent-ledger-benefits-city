#!/usr/bin/env node
/**
 * Benefits City — operator CLI. Same data and logic as the MCP server, JSON on stdout.
 * For agents/operators that prefer a shell over MCP.
 *
 *   npm run cli -- search [--type bank_account|credit_card] [--state TX] [--min 300]
 *                        [--dd] [--no-dd] [--query chase] [--limit 25] [--pretty]
 *   npm run cli -- get <id> [--pretty]
 *   npm run cli -- expiring [--days 30] [--pretty]
 *   npm run cli -- compare <id1> <id2> [id3] [id4] [--pretty]
 */
import { expiringSoon, getBonusById, searchBonuses } from "./db.js";
import { compareBonuses } from "./compare.js";
import type { BonusType } from "./types.js";

function fail(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function usage(): never {
  console.error(
    [
      "usage:",
      "  npm run cli -- search [--type bank_account|credit_card] [--state TX] [--min 300] [--dd] [--no-dd] [--query chase] [--limit 25] [--pretty]",
      "  npm run cli -- get <id> [--pretty]",
      "  npm run cli -- expiring [--days 30] [--pretty]",
      "  npm run cli -- compare <id1> <id2> [id3] [id4] [--pretty]",
    ].join("\n"),
  );
  process.exit(2);
}

type FlagValue = string | boolean | undefined;

function parseFlags(args: string[]): { positional: string[]; flags: Record<string, FlagValue> } {
  const positional: string[] = [];
  const flags: Record<string, FlagValue> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--pretty") {
      flags.pretty = true;
      continue;
    }
    if (a === "--dd") {
      flags.dd = true;
      continue;
    }
    if (a === "--no-dd") {
      flags.dd = false;
      continue;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = args[i + 1];
      if (val == null || val.startsWith("--")) fail(`flag --${key} needs a value`);
      flags[key] = val;
      i++;
      continue;
    }
    positional.push(a);
  }
  return { positional, flags };
}

function out(obj: unknown, pretty: boolean): void {
  console.log(JSON.stringify(obj, null, pretty ? 2 : 0));
}

function main(): void {
  const [, , cmd, ...rest] = process.argv;
  const { positional, flags } = parseFlags(rest);
  const pretty = flags.pretty === true;

  switch (cmd) {
    case "search": {
      const type = flags.type;
      if (type !== undefined && type !== "bank_account" && type !== "credit_card") {
        fail("--type must be bank_account or credit_card");
      }
      const min = flags.min === undefined ? undefined : Number(flags.min);
      if (min !== undefined && Number.isNaN(min)) fail("--min must be a number");
      const limit = flags.limit === undefined ? undefined : Number(flags.limit);
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) fail("--limit must be a positive integer");
      out(
        searchBonuses({
          bonus_type: type as BonusType | undefined,
          state: flags.state === undefined ? undefined : String(flags.state),
          min_bonus_amount_usd: min,
          direct_deposit_required: flags.dd === undefined ? undefined : flags.dd === true,
          query: flags.query === undefined ? undefined : String(flags.query),
          limit,
        }),
        pretty,
      );
      break;
    }
    case "get": {
      const id = positional[0];
      if (!id) fail("get needs a bonus id");
      const b = getBonusById(id);
      if (!b) fail(`unknown bonus id: ${id}`);
      out(b, pretty);
      break;
    }
    case "expiring": {
      const days = flags.days === undefined ? 30 : Number(flags.days);
      if (!Number.isInteger(days) || days < 1 || days > 365) fail("--days must be an integer 1-365");
      out(expiringSoon(days), pretty);
      break;
    }
    case "compare": {
      if (positional.length < 2 || positional.length > 4) fail("compare needs 2-4 bonus ids");
      try {
        out(compareBonuses(positional), pretty);
      } catch (e) {
        fail((e as Error).message);
      }
      break;
    }
    default:
      usage();
  }
}

main();
