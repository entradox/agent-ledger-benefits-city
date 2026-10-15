# Build brief — D-1638: add `brokerage` as a first-class `bonus_type`

**Work in this worktree ONLY:** `/Users/entradox/AI-Workbench/worktrees/bc-brokerage-type`
**Branch:** `brokerage-type-d1637`, cut from `origin/main` @ `4d1784b`. Do not switch branches.
**Base is green:** `npm run build` clean and `npm run test` = **148 tests, 148 pass, 0 fail**.
That is the bar. It must still be green when you finish, with NEW tests covering the new type.

## The task

Brokerage accounts (Moomoo, Webull, Public, Robinhood, Schwab, eToro …) cannot be catalogued
today: `BonusType` has no brokerage member. Add it as a first-class type end to end — data
model, all surfaces, all docs strings, all validation, all tests.

The value to add is exactly `"brokerage"`. Every surface below already enumerates the three
existing types; find them all with `grep -rn "savings" src/ --include="*.ts"` and treat the
result as the checklist — a missed surface is a broken surface (`/best/savings` becomes
`/best/brokerage`, the MCP `bonus_type` enum, the REST validation, the CLI `--type` guard,
stats, insights, SEO pages, OpenAPI, badges, category label, llms.txt/skill docs).

## Definition of done (all must be executed, not asserted)

1. `npm run build` clean, `npm run test` green with **≥148 passing and 0 failing**, and at
   least one NEW test that fails if `"brokerage"` is removed from `BONUS_TYPES`.
2. A brokerage record can be seeded and served: add a temporary record to
   `seed-data/`, run `npm run seed`, then prove with real output that it appears in
   `/api/search?bonus_type=brokerage`, in the MCP `search_bonuses` tool result, and on the
   human site. **Paste the commands and their real output in your final message.** Remove the
   temporary record afterwards (or keep it only if it is fully sourced — see rule 4).
3. `stats` exposes a brokerage count and the totals stay consistent.
4. **Do not invent any offer data.** If you add a real record, it needs `source_url`,
   `verification.method` = `issuer_page`, `verification.verified_at`, `last_verified_date`,
   and terms taken from the provider's own page. If you cannot verify it, use the temporary
   record for the proof and delete it before you finish.

## Hard constraints

- **No test may be weakened, skipped, deleted or narrowed.** New cases only — additive.
- **Do not touch the disclosure wording** (`src/links.ts` `disclosureShort`/disclosure page).
  It is reviewed copy.
- **Ordering and `sponsored` tests must stay green unchanged** (`src/tests/links.test.ts`,
  `sponsored.test.ts`). Commission must never influence ordering — this product's one claim.
- **Do not push and do not deploy.** No `git push`, no Railway, no `npm publish`.
- **Commit per verified step** (not one commit at the end), on the branch you are on.
- One extra fix in this same change: the README's install line is wrong —
  `npm install --ignore-scripts` produces a tree where `npm run test` fails (TS2688 / missing
  `better-sqlite3` binding, imported by `src/metrics.ts` and two tests). Correct the README to
  the command that actually works on a clean machine (`npm install`, or
  `npm install --ignore-scripts && npm rebuild better-sqlite3` — verify which, then document
  what you verified, including the base test count).

## Report format

Final message: the branch, the commits, the exact test counts, the seed/serve proof with raw
output, the list of files changed, and anything you could NOT verify.
Last line exactly: `BROKERAGE TYPE DONE`
