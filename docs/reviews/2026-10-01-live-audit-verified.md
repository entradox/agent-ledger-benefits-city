# Benefits City — audit verified against the live system, and what I changed

**Date:** 2026-10-01 · **Method:** every claim below was probed against the running system today, not read from a record.
**Branch:** `bc-defects` (worktree off `main`, commit `ebe28c4`) — the fixes below are committed but **not deployed**.

---

## 1. Essence

The product works and its trust story is real. **It has no distribution and no retention — and the copy it publishes about itself is unanswerable by its own data.** Two of those are now fixed in code; the rest need one decision each from the operator.

## 2. Live state, probed

| Fact | Value | How |
|---|---|---|
| Product up | 200 on `/`, `/healthz`, `/about`, `/disclosure` | curl |
| Offers served | 34 (12 bank, 21 card, 1 savings) · $37,767 total | `/api/stats` |
| Pages | 73 URLs in sitemap; 32 SEO pages (banks, best-of, expiring, 9 states) | `/sitemap.xml` |
| Agent surface | MCP answers with 6 tools; REST `search`/`expiring`/`insights`; `agent.json`, `server.json`, `skill.md`, `llms.txt`, `/api` all 200 | curl |
| Freshness cron | daily 06:15 ET, fired once, delivered | cron db |
| **MCP registry** | **NOT listed** — `search=benefits` → 0, `search=benefits-city` → 0, `search=entradox` → only `agent-ledger` | registry API ×3 |
| **Email capture** | **not built** | repo + live page |
| **Affiliate links** | **none live**; `sponsored` false on all 34; the Sponsored label has never rendered in production | `/api/search` |
| Verification records | **14 of 34** carry one (11 `issuer_page`, 3 `aggregator_consensus`); **20 have none** | `/api/search` |
| Last-checked age | **20 of 34 are ≥10 days old** (all dated 2026-09-20) | `/api/search` |
| Thin depth | `eligibility` filled on **4 of 34**; `offer_history` on **0 of 34**; `min_deposit_usd` on **5 of 12** bank accounts | `/api/search` |
| Direct deposit | **12 of 12** bank accounts require it | `/api/insights` |
| Expiry coverage | 22 of 34 have no end date; 12 have one; **0 expired-but-still-listed** | `/api/search` |

## 3. Where the records were WRONG about the live system

These are the findings worth as much as the new work, because each one would have misrouted effort:

1. **The Railway `$20` hard-cap outage is over** — it ended at the 10:45Z billing rollover. The service was live when I probed. The signal is historical; only its *lesson* (no Railway usage watchdog exists, so it recurs at the next cap event) still stands.
2. **The private repo is NOT a blocker for the registry.** I said it was, from the handoff's "private" note. Probed: GitHub auth grants `io.github.entradox/*` from the **GitHub identity**, not from repo visibility — the registry never inspects the repo. `mcp-publisher validate` → *"✅ server.json is valid"*, and `mcp-publisher login github -token "$(gh auth token)"` → *"✓ Successfully logged in"*, non-interactively. **There is no 5-minute window and no browser step.** I published nothing — that stays the operator's call.
3. **`server.json` on GitHub does not exist** — `gh repo view entradox/agent-ledger-benefits-city` returned `isPrivate: true` and no root `server.json`. The "refresh from the live URL first" note was unnecessary; the live copy is correct.
4. **My own intermediate reading was wrong and I corrected it.** I briefly measured `states_available` as "a 10-character state list" on 27 offers and nearly filed a state-filter bug. It is the string `"nationwide"`; the filter matches correctly and has tests. There was no bug. (Recorded because a false finding is worse than no finding.)
5. **The freshness cron's coverage is 11/34 reachable by design, not by accident** — the `issuer_page` method count is the honest ceiling for the "verify on the issuer's own page" rule.

## 4. Defects found and fixed (commit `ebe28c4`, 111/111 tests green)

1. **The prompt we publish in three places is unanswerable by our own data.**
`"Which checking bonuses over $300 need no direct deposit in Texas?"` — all 12 bank accounts require direct deposit and exactly **1** offer is available in TX. The honest answer is an empty list. This is **live right now on `/benefits/agents`** and was staged for the directory listing and launch prompts. An agent that runs our own example, gets nothing, and learns the dataset is empty is the worst first impression this product can make. Rewritten to a phrasing the data answers, in `site.ts`, `agent-launch-prompts.md`, `directory-listing-copy.md`.
2. **Two MCP examples also returned empty** — the "no direct deposit" checking search (0 results) and the "Texas savings" search (we carry 1 savings offer and it is not in TX). Replaced.
3. **A latent protocol landmine, found by the new test.** `normalize()` defaulted only *some* optional fields. MCP validates **every** property declared in `outputSchema` as required, so a record missing `bonus_points`/`annual_fee_usd` fails the entire structured response with `-32602` — an error where the caller asked a plain question. **10 of 12 bank accounts omit those keys.** It did not fire in production only because the deploy path happens to fill them. Defaulted all optional-by-intent fields so a thin record degrades to `null` instead of breaking the response.
4. **A regression guard that holds the line.** New `src/tests/examples.test.ts` runs every published MCP example *and* every "Try asking" prompt on the site against the shipped seed data, and fails if any returns nothing — plus asserts the expiry example falls inside a window the data actually has offers for. It caught defect 3 while being written.

**Deploy status: NOT deployed.** `main` is the deploy ref; this commit sits on `bc-defects`. Nothing reaches users until it ships.

## 5. What the audit got right, and where I disagree

**Right:** verification debt, thin depth, no retention, no registry listing, single-operator risk, and "affiliate networks approve sites with content and traffic" (which is why the trust work is sequenced before the money work).

**Where I disagree, and why:**

- **"Data breadth is the biggest gap" — no. Demand is.** The site served 2 visitors in 24h. A 35th offer on a page nobody reads produces zero; adding offers is buying inventory for a store with no door. Breadth is the right *second* bet, once something is arriving.
- **The 90-day framing puts building ahead of unblocking.** Three tasks cost almost nothing and gate everything downstream: the registry publish (now proven to be one command), Privacy + Terms pages (`/privacy` and `/terms` are **404** — required before email capture and before affiliate applications), and the entity/DBA answer. Do those first; they are not a bet, they are the floor.
- **"Agent traffic is small today" understates it — but the cost is near-zero**, so C is worth doing *precisely because* it is nearly free, not because it will convert. One command plus one eval.
- **The real risk nobody named:** the freshness cron runs on this Mac, the data is a JSON file on this Mac, and one person holds every credential. The business is one laptop failure from being a static page. That is not a backlog item; it is a continuity problem.

## 6. Recommended order

1. **Publish to the registry** — proven one-command, no window, no browser. (Operator's gate: it is an external publish.)
2. **Privacy + Terms pages** — currently 404; block email capture and every affiliate application.
3. **Deploy `bc-defects`** — the dead prompt is live to agents today.
4. **Then** pick one bet. My pick: **B (email/owned audience)** over A, because retention compounds on any traffic source and needs no new data pipeline — but B needs the operator's provider + sender domain, so it stalls without a decision. A is the stronger moat but is worthless until someone arrives.
5. **Keep C light** — ship the eval harness to answer "do agents actually pick this?" with a number instead of an assumption.

**Decision rule I would add to the audit's:** if the registry + directories produce no agent calls within 30 days, that is evidence about *agent demand for this category*, not a reason to build more pages.

---

### Unverified — stated plainly, not guessed
- **Whether Google/Bing index the site.** Scraped SERP checks were inconclusive (the only matches were the query echoed in the page title). The reliable answer needs Search Console, which needs the operator's account. The audit's "no Search Console, no Bing verification" claim is *consistent* with what I saw — **no verification meta tag on the page** — but I did not confirm either way.
- **Which of the 34 offers are still live at the issuer.** Four parallel verification runs are in flight; their reports land in `docs/data-ops/tranche2/reports/`.
