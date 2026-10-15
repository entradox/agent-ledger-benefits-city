# Bridge map: bankrewards.io → benefits-city

Frame card **D-1636** · 2026-10-11 · author: Hermes · source recon: D-1635
(`~/AI-Workbench/projects/bankrewards-clone/replica/recon.md`, 16 sources, 17 screens,
39 feature rows).

Method: everything below is **probed**, not read from the README. Live probes were made
against `https://aiagentscity.com/benefits` on 2026-10-11; local probes against the
worktree at `~/AI-Workbench/projects/benefits-city`. Where a claim comes from a document
rather than a probe, it says so.

## The essence

benefits-city is not missing the *product* — it is missing the *scale* and the
*discovery surface*. It already beats the target on the machine-readable layer
(MCP over HTTP+stdio, REST parity, `llms.txt`, OpenAPI, per-record verification) and on
trust (ordering provably never influenced by commission). Two gaps actually cost
something: **0 of 36 offers carry an affiliate URL**, so every apply click is
unmonetized; and the catalog is **36 offers against their ~494**.

## Probed state

| Probe | Result |
| --- | --- |
| `GET /benefits` | 200, 46,790 bytes, "US Bank & Credit Card Signup Bonuses, Verified — Benefits City" |
| `GET /benefits/api/stats` | `total_offers: 36` (13 bank / 22 card / 1 savings), `total_bonus_usd: 36,522` |
| `GET /benefits/api/bonuses.json` | 36 records; **all 23 public fields present on every record** (`verification`, `status`, `offer_history`, `eligibility` included); 13 carry `expiry_date` |
| `POST /benefits/mcp` (initialize) | 200, serverInfo `benefits-city 0.3.0`, capabilities: tools + resources |
| `GET /benefits/bonuses` filters | `type` (select), `state` (2-char input), `min` (number), `dd` (select), `q` (search), `sort` (select) — all live |
| `GET /benefits/bonuses` rendering | all 36 offer links on one page (no pagination needed at this size) |
| `GET /benefits/bonuses/<id>` | sections "How to earn it" + "Ready to apply?", affiliate disclosure present |
| `GET /benefits/go/<id>` | **302** → `https://account.chase.com/consumer/banking/checkingandsavingsoffer` — tracking rail works end to end |
| `sponsored` flag across the feed | `{False}` — **0 of 36 offers are monetized** |
| `GET /benefits/sitemap.xml` · `/robots.txt` · `/llms.txt` | 200 / 200 / 200 (robots allows all and declares the sitemap) |
| `GET /benefits/does-not-exist-xyz` | proper 404 (3,953-byte page) |
| Structured data (`application/ld+json`) on a detail page | **0 occurrences** |
| Theme toggle / newsletter capture | **absent** on the browse surface |
| Local build + tests | `npm run build` clean · **74/74 tests pass** |

## Divergences found while mapping — record vs reality

1. **The local checkout is not the product.** `git rev-list --left-right --count HEAD...origin/main`
   = `4  41`. Local HEAD is `d9f8c0f` (2026-10-09); origin/main is **41 commits ahead** and
   carries the B2 UI rebuild (card grid grouped by category), whole-card clickable + WCAG
   focus ring, instrumentation on every agent-discovery surface with a page-level bot split,
   IndexNow, rate limiting, a schema validator/canary, and the SEO/sponsored test suites.
   Any plan built from the local tree is built on a stale surface.
2. **Three numbers for one dataset.** README says **33 records** (15 bank / 17 card / 1 savings);
   local `seed-data/` holds **29** (12 / 16 / 1); the live API serves **36** (13 / 22 / 1).
3. **README §"Seed data provenance" claims every record carries `source_url`, `verification`
   and `last_verified_date`.** In the local tree only **9 of 29** carry `verification` and
   **5 of 29** carry `status`. (This is local drift — the live records are complete.)
4. **README points at an `AFFILIATE_PLACEHOLDER` constant in `src/site.ts`.** grep across
   `src/`: **0 hits.** The mechanism that exists is `affiliate_url` → `/go/:id`, and it works.
5. **4 local commits are not on origin** (including an `og:image` SEO fix) and
   `docs/design/`, `docs/launch/`, `docs/data-ops/tranche2/`, `frame-cards/D-1562.md`,
   `D-1568.md` are untracked. Nothing here is lost — but nothing here is deployed either.

## Gap table

Legend — **Ahead**: we are better than the target. **Parity**: equivalent.
**Behind**: the target has it and we do not. Priorities: **P0** money or truth,
**P1** surface depth, **P2** discovery engine.

| # | Surface (target) | Ours (probed) | Gap | Bridge | Pri |
| --- | --- | --- | --- | --- | --- |
| 1 | Affiliate outbound + disclosure | rail live (`/go/:id` → 302), disclosure live, **0/36 sponsored** | no revenue on existing traffic | approve affiliate programs, then set `affiliate_url` per record (`docs/affiliate-signup-checklist.md`) | **P0** |
| 2 | Trustworthy catalog record | 36 live records, all fields, verification per record | local docs contradict it | reconcile worktree to origin/main, then correct the README numbers | **P0** |
| 3 | ~494 offers (343 bank / 73 card / 21 brokerage / 57 business) | 36 (13 / 22 / 0 / 0 / 1 savings) | **7% of their catalog**; no brokerage or business coverage at all | set an explicit target (150? 300?) and run the existing freshness pipeline + review queue against it | **P0** |
| 4 | Detail depth: metric tiles (bonus / fee / to-qualify / availability / expiry) + 3 term sections | 2 sections ("How to earn it", "Ready to apply?") | thinner than the reference | add the tile row + a real fine-print section from data already in the record | P1 |
| 5 | Per-state availability, displayed and filterable | `states_available` in data, `state=` filter live | no multi-state display, no eligibility clarity | render the state list + make the filter and the display agree | P1 |
| 6 | Suggest-an-offer + report-an-error | absent | no community input into the catalog | two small forms; they also feed #3 | P1 |
| 7 | Structured data / rich results | **0 ld+json** | machine-readable product without schema.org markup | emit `Product`/`Offer` JSON-LD from the record | P1 |
| 8 | 10 calculators (ROI, tax, buy-or-rent…) | absent | no interactive content | ship the **bank-bonus ROI calculator** first — it consumes our own data | P2 |
| 9 | Blog: 34 guides, 17 topic categories | changelog only | no organic discovery engine | 3-5 guides answering the questions the data raises (DD timing, taxes, ChexSystems) | P2 |
| 10 | Bank Matcher (4-step wizard) | absent | no guided discovery | build a 4-step matcher over `search_bonuses` | P2 |
| 11 | Newsletter capture | absent | no owned audience | footer capture wired to a real list | P2 |
| 12 | Search / filters / sort | **live and equivalent** (`type`, `state`, `min`, `dd`, `q`, `sort`) | **parity** | — | — |
| 13 | Category listing pages | `/bonuses?type=…` + category groups (origin) | **parity** | — | — |
| 14 | Sitemap, robots, 404 | all live | **parity** | — | — |
| 15 | Agent-native access (MCP, REST, CLI, `llms.txt`, OpenAPI, server.json, skill resource) | **all live** — they have none | **we are ahead** | keep it ahead: it is the moat they cannot copy | — |
| 16 | Commission-neutral ordering | enforced by a test | **we are ahead** | state it on the site; it is a trust claim they cannot make | — |
| 17 | Agent-instrumentation, rate limiting, IndexNow, schema canary | on origin/main | **we are ahead** | — | — |
| 18 | Availability map, theme toggle, load-more, advertiser-disclosure modal | absent | **not worth copying** (36 records fit one page; disclosure page is stricter) | — | skip |

## Ranked bridge plan

**P0 — money and truth (do first, cheapest to highest effort)**

1. **Turn monetization on.** The rail is built and returns a real 302; the only missing
   ingredient is `affiliate_url` on the records. This is an operator action (affiliate
   program approvals) plus a data edit — **not a build**. Every day it stays off, the
   clicks the site already earns pay nothing. *Same shape as a live payment rail with no
   traffic pointed at it: do not build more rails.*
2. **Reconcile the worktree to `origin/main`** and then correct the README's numbers
   (§"Seed data provenance", the phantom `AFFILIATE_PLACEHOLDER`, the record counts).
   Not a hard reset — 4 local commits and 5 untracked docs paths need a keep/drop decision.
   Do this before any other bridge work, or the next session plans against a stale tree.
3. **Set and work a catalog target.** 36 → 150 offers is the single biggest gap.
   The pipeline exists (freshness check + review queue + the seed upsert/prune path);
   the binding constraint is **review labour**, not code. Prioritise credit cards
   (22 → the target's 73) and open the two categories we have **zero** coverage in:
   brokerage and business accounts.

**P1 — surface depth (a human must trust the page)**

4. Detail tile row + fine-print section.
5. State availability display, agreeing with the filter.
6. Suggest-an-offer and report-an-error forms.
7. JSON-LD on detail pages.

**P2 — discovery engine (where their traffic comes from)**

8. Bank-bonus ROI calculator, then a small guide set, then the matcher, then newsletter.

## What NOT to copy

- Their affiliate contracts (apply for our own), their SEO history (547 indexed URLs is an
  asset we cannot clone), their brand, and their institution logo set.
- Their content *volume*. Competing on a 34-post blog against an established domain from a
  standing start means losing on their axis. Our differentiator is the machine-readable,
  commission-neutral, verified catalog — build discovery *around that*, not around theirs.

## Limits of this map

Not verified: mobile layout, empty/loading states on the live site, whether the 4 local-only
commits contain anything origin needs, and whether the 36 live records pass the origin
tree's newer schema validator. Nothing in this document was inferred from the README.

## Companion document

**`docs/bridge/inventory-gap.md`** (same frame card) holds the inventory half: 36 offers
against their 497, the issuer-overlap math, the three-tier gap, and the concrete add-list
with the values their own category pages state. Read the two together — this file is the
feature and sequencing view, that one is the catalog view.

## Decision this map needs

Which P0 runs first, and what the catalog target number is. Everything else in this file
follows from those two.
