# benefits-city — state

Updated: 2026-10-11 · written by Hermes (D-1636)

## What it is

US bank-account, savings and credit-card signup bonuses, **verified by hand**, served
three ways from one dataset: a server-rendered site for humans (`/`, `/bonuses`,
`/bonuses/:id`, `/agents`), an MCP server for agents (Streamable HTTP `POST /mcp` +
stdio), and REST/JSON feeds + `llms.txt` + OpenAPI + a CLI for operators. Live at
`https://aiagentscity.com/benefits` (reverse proxy, `BASE_PATH=/benefits`).

## Where it stands (probed 2026-10-11, not read from the README)

- Live and healthy: `/benefits` 200; `/api/stats` → **36 offers** (13 bank / 22 card /
  1 savings), `total_bonus_usd` 36,522; `POST /mcp` initialize → `benefits-city 0.3.0`.
- All 23 public fields present on all 36 live records (verification, status,
  offer_history, eligibility included).
- Browse surface is real: search, type/state/min/direct-deposit filters, sort.
- **Monetization rail is built and unmonetized**: `/go/:id` returns a true 302 to the
  issuer page (verified), but `sponsored` is `false` on **36 of 36** → every apply click
  is unmonetized.
- Local build clean, **74/74 tests pass**.
- No structured data (`ld+json`) on detail pages; no newsletter capture; no theme toggle.

## Record divergences (fix before planning anything else)

1. **Local worktree is 41 commits behind `origin/main`** (and 4 commits ahead). The local
   tree is not the product; origin carries the B2 UI rebuild, clickable cards + focus ring,
   agent-surface instrumentation, IndexNow, rate limiting, schema canary and new test suites.
2. README says 33 records (15/17/1); local seed-data holds 29 (12/16/1); live serves 36 (13/22/1).
3. README's "every record carries source_url, verification, last_verified_date" is false in
   the local tree (9/29 and 5/29 respectively) — a local-drift artifact, not a live defect.
4. README cites an `AFFILIATE_PLACEHOLDER` constant in `src/site.ts` — grep finds none.
5. 4 local commits + `docs/design/`, `docs/launch/`, `docs/data-ops/tranche2/`,
   `frame-cards/D-1562.md`, `D-1568.md` are untracked/unpushed.

## Open work

- **D-1636** — gap analysis vs the bankrewards.io recon, three documents:
  - `docs/bridge/bankrewards-gap-map.md` — probed live-product evidence, the four
    record-vs-reality divergences, the full 18-row feature table, and the ranked
    P0/P1/P2 bridge plan.
  - `docs/bridge/inventory-gap.md` — **inventory**: 36 offers vs their 497 (13.8×),
    0 brokerage and 0 business coverage, the issuer-overlap math (71 of their 497 pages
    name issuers we also list; 426 name something we don't), the concrete add-list, and
    the **decision of record** (§7).
  - `docs/bridge/RECORD-STANDARD.md` — **the gate every added record passes.** Binds the
    catalog to the claims our own live surfaces already make; read this before any batch.
  - `docs/bridge/data/` — both inventories as JSON + `inventory_gap.py` (re-runnable).

## Decisions of record (principal, 2026-10-11)

1. **Catalog target: 494 records** (from 36 → **458 to add**).
2. **Business accounts + brokerage: in scope, first** (both zero coverage, both national).
3. **Tier C long tail (328 community-bank / CU names): in scope** — this makes 494 a
   programme, not a batch.
4. **Standing constraint: do not deviate from our publishing standards.** Operationally
   that is `docs/bridge/RECORD-STANDARD.md`, plus `rules/live-claim-verification.md`.

## What blocks the first batch

- ~~**Brokerage has no `bonus_type`**~~ — **DONE 2026-10-11**: branch `brokerage-type-d1637`
  off `origin/main`, commit `2dc39f4`, 10 source files + README + a new test file.
  Base was 148/148 tests; now **154/154 pass**, build clean. Proven end to end on the
  branch: a seeded brokerage record was served by `/api/search?bonus_type=brokerage`,
  returned by the CLI (same logic as the MCP tool), counted in `/api/stats`
  (`brokerage_offers`) and `/api/insights`, listed on `/bonuses` under the **Brokerages**
  group, rendered its own detail page with the Brokerage badge and "Brokerage bonus" fact,
  and `/best/brokerage` returned 200. No offer data was added: the proof record was
  temporary and `npm run seed` pruned it (back to 36 records).
  **Not pushed, no PR opened yet.**
- **The local worktree is 41 commits behind `origin/main`** and sits on a stale feature
  branch. Work in a worktree cut from `origin/main` — `~/AI-Workbench/worktrees/bc-*` is the
  established pattern (bc-record-fixes, bc-ui-rebuild, bc-verify, bc-defects, bc-rate-limit).
- The **rolling-monthly re-verification promise** scales with the catalog: 494 records ≈
  16–17 re-verifications per day. Growing the catalog without growing the sweep makes a
  published sentence false.

## Correction (2026-10-11)

I earlier reported the README's install line as a defect ("`--ignore-scripts` gives a tree
where `npm run test` fails"). That was read from the **stale local copy**. `origin/main`'s
README already documents it correctly (`npm install`, or `--ignore-scripts` then
`npm rebuild better-sqlite3`). No fix was needed; the change I staged was reverted before
the commit. The stale tree, not the product, produced the claim.

## Worker loop (approved mechanism, not built yet)

Input exists: **`docs/bridge/data/target-queue.{json,csv}`** — 397 targets with type,
tranche and a reference URL. Tranches: **A = 32** (business + brokerage, zero coverage),
**B = 79** (national brands), **C = 286** (community-bank long tail).

Still to build: the fetch → draft → review → promote path (provider page fetched per record,
draft written with its `source_url` + `verification`, reviewed, then promoted into
`seed-data/`), plus the scheduled run. Every record passes `docs/bridge/RECORD-STANDARD.md`.

## Related finding

The affiliate rail is already verified in production: the live `/disclosure` page carries an
**Impact site-verification meta tag** (plus a second `fo-verify` tag), and Impact is the
network `REFRESH_PLAN.md` names first. "Wire affiliate URLs" is therefore an approval + data
step on a working rail, not greenfield.

## Prior frame cards on origin

D-1562 (UI rebuild), D-1568 (expiry corrections + 3 Chase offers), D-1559 (offer schema),
D-1552 (surface), D-1543 (launch docs), D-1518 (agent-native parity).

## Open questions for the principal

1. Approve the **brokerage schema change** (adds a `bonus_type`; changes the MCP tool
   contract and the filters)?
2. **Pace**: dispatch bulk verification as a worker loop (cron/lane, many sessions), or work
   tranche by tranche in-session with a PR per batch?
