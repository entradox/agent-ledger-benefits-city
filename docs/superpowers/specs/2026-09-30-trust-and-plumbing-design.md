# Benefits City — Sub-project 1: Trust & Plumbing (Design Spec)
**Desk ID:** D-1518 · **Date:** 2026-09-30 · **Status:** awaiting principal review **Agent-of-record:** turing (build) · Gates: Strat (affiliate model), Morgan (disclosure/claims), Turing (code)
## 1. Intent (agreed with principal)
Benefits City is the next-generation Hustler Money Blog / NerdWallet for US bank-account and credit-card bonuses: **one place for humans and agents**. Revenue is affiliate commission (principal signs up for networks himself — not started as of 2026-09-30). Growth comes over time; the product is also an MCP / CLI / agent-first surface, listed as a connector for Claude, Muse and other agents.

**Chosen strategy (principal-approved 2026-09-30): "bonus planner + alerts, agent-first."** A bonus list is a commodity; the durable wedge is fresh, issuer-verified data plus eligibility-aware planning, reached by humans (newsletter, pages) and agents (MCP, registry, connector). Rejected: NerdWallet-style content at scale (slow, incumbents hold rankings); pure agent data API (agents do not pay, no revenue path).

**Success for this sub-project:** the data is trustworthy and self-maintaining, the site and MCP are discoverable by agents, and the moment the principal is approved by an affiliate network a link can be dropped in with zero code change and correct disclosure.
## 2. State at start (probed 2026-09-30, not assumed)
- Live at `aiagentscity.com/benefits`: `/`, `/bonuses`, `/agents`, `/llms.txt`, `/api/stats`, `/healthz`, `/sitemap.xml`, `/about`, `/disclosure` → 200. MCP `tools/list` works via public proxy.
  
- 29 records (14 bank / 15 card), 17 issuers, top bonus $6,000 (card, valued points). Manual refresh.
  
- `/go/:id`-style apply-click redirect with click counting exists (D-1409). Metrics dashboard exists.
  
- `/.well-known/mcp.json`, `/server.json`, `/auth.md` → 404. No registry listing.
  
- No affiliate accounts. 12 of 29 records have `application_url == source_url`.
  
- Traffic: 0 visitors / 0 apply clicks / 0 MCP calls in 24h.
  
## 3. Design
### 3.1 Data model (extend, do not rewrite)
Add to the record schema (`src/types.ts`, `src/seed.ts` validation):

- `bonus_type` gains `savings`.
  
- `application_url` = true issuer page; new nullable `affiliate_url`.
  
- `offer_history[]` — `{amount_usd, valid_from, valid_to}`.
  
- `verification` — `{method: "issuer_page" | "aggregator_consensus", verified_at, sources[]}`.
  
- `status` — `active | expired | needs_review`.
  
- `eligibility` — structured, nullable fields (new-to-bank, state limits, card-family rules such as issuer velocity rules, lifetime/once-only flags). Populated where known; the planner (later sub-project) consumes it. All new fields optional so the 29 existing records remain valid.
  
### 3.2 Freshness pipeline (extend Hermes; no new system)
- Daily job fetches each record's source page; diffs amount, expiry, and a normalized-text hash.
  
- Expired or changed records go to a **review queue** file; nothing publishes unreviewed.
  
- Never scrapes bot-blocking sites (robots/ToS respected). A blocked page falls back to the aggregator-consensus tier per `REFRESH_PLAN.md`; a bot-error page never counts as "offer dead."
  
- The "verified on issuer page" badge is shown **only** when the issuer page was actually fetched.
  
- Expired records are filtered from all surfaces (site, feeds, MCP) by `expiry_date`/`status`.
  
- Extend the existing daily brief cron rather than adding a parallel job. Output is deterministic (per `rules/prose-vs-code.md`): exit codes, distinct "no data" state, canary.
  
### 3.3 Affiliate-ready link layer
- Existing apply-click redirect resolves `affiliate_url` if present, else `application_url`.
  
- Disclosure on every surface: site pages, JSON feeds, `llms.txt`, MCP tool output, agent docs.
  
- **Ranking/sorting never uses commission.** Sort key is bonus value (and stated filters) only. Enforced by an automated test. This is both the trust moat and the compliance position.
  
- Deliverable to principal: checklist of affiliate networks and what each requires. The signups, credentials and tax/entity steps are the principal's.
  
### 3.4 Agent discoverability (per Agent-Native Standard)
- Publish `server.json` and `/auth.md`; list in the official MCP registry.
  
- Add `benefits_api_docs` and `benefits_examples` tools; typed error envelope `{type, message, code?, param?}`; date-pinned version header; serve a product skill as a `skill://` resource (advertising the skills extension stays off until the SDK ships models).
  
- `/agents` page gets per-client one-line connect commands (Claude, Claude Code, Muse) and three example prompts. Metrics dashboard remains the dogfood telemetry.
  
### 3.5 Data ops (first task, before new code)
Re-verify against sources, then apply — not copied blindly from the 2026-09-30 brief: Wells Fargo $500 swap (open by 2026-10-06), Chase Total Checking $300→$400, TD Beyond renewal (to 2026-11-30 if confirmed), lapsed/expiring-today removals (Fifth Third, Bank of America, Huntington, Amex Marriott Brilliant), and the 6 unseeded records. Three candidate new offers (Citi, Barclays savings, PeoplesBank) only after issuer-page confirmation; the Chase Freedom Unlimited $250 claim is held.
## 4. Acceptance (machine-checkable)
1. An expired record is never served on site, feed, or MCP (fixture + live check).
  
2. A changed-amount fixture is flagged into the review queue.
  
3. Commission-independent sort test passes (sort result identical with commissions randomized).
  
4. `/server.json`, `/auth.md`, `/.well-known/mcp.json` → 200 and registry listing confirmed.
  
5. Freshness job fails loudly on bad input; canary proves it can go RED.
  
6. Disclosure present on all surfaces; Morgan receipt recorded; Turing review recorded.
  
7. Existing 29 records still validate; `npm run typecheck` and build pass.
  
## 5. Out of scope here — SEQUENCED ROADMAP (so nothing is missed)
Each item below gets its own brainstorm → spec → plan → build. Order reflects dependency and payoff; revisit after each step.

| #   | Sub-project | Depends on | What it delivers | Notes |
| --- | --- | --- | --- | --- |
| **0** | **Affiliate signups (principal action)** | Step 1 done (clean live site) | Network approvals (e.g., Impact, Awin, CJ, issuer/card-specific programs) | Starts right after this sub-project ships; agent prepares checklist. Verify each network's real terms before relying on them. |
| **2** | **Human growth engine** | 1   | Newsletter + expiry/new-offer alerts (owned audience), per-offer and per-bank pages, monthly "best bonuses" guides, community distribution | Ogilvy pre-build gate: first-100 users path. No paid acquisition until conversion is measured. |
| **3** | **Planner & tracker** | 1 (eligibility fields) | Eligibility-aware "next best bonus", sequencing, deadline tracker, payout tracker; exposed as MCP tools and human UI | The core differentiator. |
| **4** | **Agent distribution push** | 1, 3 | Claude connector listing, Muse integration, additional registries/directories, example prompts, dogfood numbers on landing page |     |
| **5** | **Offer history & "verified on issuer page" badge as marketing** | 1   | Public offer-history pages ("best time to apply"), badge campaign against aggregator drift |     |
| **6** | **Coverage expansion** | 1   | More issuers, business cards, more savings/CD bonuses, regional offers | Driven by click/search data, not guessing. |
| **7** | **Design & UX pass** | 2   | Screenshot review of all pages, mobile, conversion-flow polish | Not yet reviewed; start with screenshot-critique. |
| **8** | **Monetization beyond affiliate** | 2–4 | Possible sponsored placements (clearly labeled, never affecting rank), premium alerts | Strat + Morgan gate first. |

Also parked: paid acquisition, user accounts, PII-storing features (privacy/DPIA-lite required before any).
## 6. Risks
- **Compliance:** financial-offer claims and affiliate disclosure (FTC; issuer affiliate terms). Morgan reviews wording; no rate/fee claims without a live source.
  
- **Trust:** a single stale or commission-biased result erodes the moat; hence the tests above.
  
- **Network approval:** zero traffic may slow approvals; mitigated by a clean, honest site and real content (sub-project 2).
  
- **Source blocking:** issuer pages often block bots; mitigated by the consensus tier, never by routing around blocks.
