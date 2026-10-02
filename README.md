# Benefits City — an AI Agent City project

US **bank account opening bonuses** and **credit card signup bonuses**, verified
by hand — served two ways:

| Audience | Interface | How |
|---|---|---|
| **Humans** | Server-rendered site: landing, filterable browse, bonus detail pages, agent docs | `npm start` → `/`, `/bonuses`, `/bonuses/:id`, `/agents` |
| **Agents** | MCP server — 6 tools over **Streamable HTTP** (`POST /mcp`) and **stdio** | `npm start` → `/mcp` · `npm run mcp` |
| **Agents** | JSON feeds + `llms.txt` | `/api/bonuses.json`, `/api/bonuses/:id`, `/api/stats`, `/llms.txt` |
| **Operators** | CLI, same data/logic as MCP, JSON on stdout | `npm run cli -- …` |

One database, two first-class interfaces. Live stats on the landing page are
computed from the real data — they can't go stale.

## Install & run

```bash
cd ~/workspace/bank-bonus-agent
npm install                    # builds better-sqlite3 (metrics); with --ignore-scripts run `npm rebuild better-sqlite3`
npm run build                  # tsc -> dist/
npm run test                   # tsc + node:test suite (dist/tests)
npm run freshness              # daily source check -> data/review-queue.json (see REFRESH_PLAN.md)
npm start                      # prestart seeds data/bonuses.json, then serves on PORT (default 3000)
```

Useful env vars:

| Var | Default | What |
|---|---|---|
| `PORT` | `3000` | listen port (Railway injects its own) |
| `BASE_PATH` | `""` | mount under a subpath, e.g. `/benefits` — all links/assets/forms follow |
| `PUBLIC_URL` | derived | canonical public URL for docs/`llms.txt`, e.g. `https://aiagentscity.com/benefits` |
| `BONUS_DB_PATH` | `data/bonuses.json` | override the JSON store location |

Other commands: `npm run mcp` (stdio MCP server), `npm run cli -- …`,
`npm run seed` (re-runnable upsert), `npm run typecheck`.

## For agents: connect via MCP

Streamable HTTP — any MCP-compatible client (Claude, Claude Code, Muse, …),
no API key (see `/auth.md`):

```
POST {PUBLIC_URL}/mcp
```

Claude Code, one line:

```bash
claude mcp add --transport http benefits-city https://aiagentscity.com/benefits/mcp
```

Discovery: `/server.json` (MCP registry manifest, also at `/.well-known/mcp.json`), `/.well-known/agent.json`,
`/.well-known/mcp/server-card.json` (generated from the live tool list), `/openapi.json` (OpenAPI 3.1),
`/auth.md`, `/llms.txt`, `/skill.md` (also served as a `skill://benefits-city/benefits-city/SKILL.md` MCP resource),
`/docs` (alias of `/agents`), and `/changelog` (+ `/changelog.json`, `/feed.xml`; data in `changelog/changelog.json`).

REST parity with the MCP tools: `GET /api/search`, `/api/expiring`, `/api/compare?ids=a,b`, `/api/bonuses/:id`,
`/api/bonuses.json`, `/api/stats` — same filters, same public shaping, errors as
`{"error":{"type","message","code?","param?"}}` (400 names the bad parameter; 404 for unknown/expired ids).

Claude Code / Claude Desktop config (via `mcp-remote`):

```json
{
  "mcpServers": {
    "benefits-city": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://aiagentscity.com/benefits/mcp"]
    }
  }
}
```

Local stdio (self-hosted): `node dist/mcp-server.js` after `npm run build`.

Example agent interactions:

```
# Which checking bonuses pay $400+ and don't require direct deposit?
search_bonuses({ "bonus_type": "bank_account", "min_bonus_amount_usd": 400,
                 "direct_deposit_required": false })

# Full terms for one offer
get_bonus({ "id": "chase-total-checking-400" })

# What's expiring in the next 2 weeks?
expiring_soon({ "days": 14 })

# Head-to-head
compare_bonuses({ "ids": ["bmo-checking-600", "sofi-checking-savings-400"] })
```

Same via shell (use `node dist/cli.js` directly when piping — `npm run` prints a banner):

```bash
node dist/cli.js search --type bank_account --state TX --min 300 --pretty
node dist/cli.js get chase-total-checking-400 --pretty
node dist/cli.js expiring --days 30
node dist/cli.js compare bmo-checking-600 sofi-checking-savings-400
```

Via HTTP:

```bash
curl localhost:3000/api/bonuses.json | jq '.[].id'
curl localhost:3000/api/bonuses/us-bank-smartly-checking-450
curl localhost:3000/api/stats | jq '{total_offers, total_bonus_usd}'
curl localhost:3000/llms.txt
```

## Tool contract

| Tool | Inputs | Output |
|---|---|---|
| `search_bonuses` | `bonus_type?` (`bank_account`\|`credit_card`\|`savings`), `state?` (2-letter code; nationwide always matches), `min_bonus_amount_usd?`, `direct_deposit_required?`, `query?` (bank/product substring), `limit?` (1–100, default 25) | Array of bonus records, highest bonus first |
| `get_bonus` | `id` | Full record, or typed `not_found` error |
| `expiring_soon` | `days?` (1–365, default 30) | Records with stated expiry inside the window, soonest first. No-stated-expiry offers excluded |
| `compare_bonuses` | `ids` (2–4) | `{ bonuses: [...], summary: { highest_bonus_usd, earliest_expiry } }`, or typed `not_found` error listing unknown ids |
| `benefits_api_docs` | — | Markdown docs: tools, fields, ordering guarantees, error format |
| `benefits_examples` | — | Runnable example calls `{title, tool, arguments}` |

Every record returned by MCP/CLI/feeds is shaped by `toPublic()` (`src/links.ts`): the raw
`affiliate_url` is never published; consumers get `apply_url` (our `/go/:id` tracked link),
`sponsored` (bool) and `disclosure_url`. Ordering is bonus value descending (ties by id) and is
never influenced by commissions (enforced by a test). Expired offers are never returned.
Errors use `{"error":{"type","message","code?","param?"}}`.

Tool definitions live in `src/mcp-tools.ts`, shared by the stdio server and the
Streamable HTTP transport so the contract can't drift. (Stateless HTTP follows
the SDK pattern: one fresh server + transport per request.)

## Data schema (per record)

`id` (kebab-case) · `bank_or_issuer` · `product_name` · `bonus_type` (`bank_account` \| `credit_card` \| `savings`) ·
`bonus_amount_usd` (bank accounts: advertised bonus; credit cards: **estimated USD value of the points/miles bonus — valuation basis stated in `requirements`**) ·
`bonus_points` · `annual_fee_usd` · `requirements[]` (plain-English qualifying steps) ·
`min_deposit_usd` · `direct_deposit_required` · `expiry_date` (`YYYY-MM-DD`, null = no stated end) ·
`states_available` (`"nationwide"` or state-code array) · `application_url` ·
`source_url` (where live terms were confirmed) · `last_verified_date` ·
`verification` (`issuer_page` = the issuer's own page was fetched; `aggregator_consensus` = 3+ reputable listings agree; plus `verified_at` and `sources[]`) ·
`status` (`active` \| `expired` \| `needs_review`) · `offer_history[]` · `eligibility` (structured, nullable) ·
`affiliate_url` (**input only** — used by `/go/:id`, never published).

"Today" is the US Eastern calendar date: an offer valid through 9/30 is served all day on 9/30 ET.

## Seed data provenance

33 records (15 bank account, 17 credit card, 1 savings). The base set was verified live on
**2026-09-20**; on **2026-09-30** (D-1518) the soonest-expiring and highest-impact records were
re-verified, 4 offers were added from issuer pages, and unverifiable claims were deliberately left out.
Every record carries `source_url`, `verification` and `last_verified_date`; nothing was invented.
See `REFRESH_PLAN.md`.

Known caveats: for Chase and Wells Fargo no verbatim official offer-page URL surfaced, so
`application_url` points at the page where terms were confirmed; BMO's record uses a Doctor of
Credit page for both URL fields. Swap in true bank URLs / affiliate links later.

## What's stubbed (deliberately)

- **`application_url` = official offer pages, not affiliate links.** The user signs up for bank
  affiliate programs themselves; swap URLs when approved (marked `AFFILIATE_PLACEHOLDER`
  in `src/site.ts`; also update the disclosure page's "Current status" section).
- **Refresh is detect-and-review, not auto-publish.** `npm run freshness` reports expired / changed /
  amount-mismatch offers into a review queue; a human or agent edits `seed-data/` — see
  [REFRESH_PLAN.md](REFRESH_PLAN.md).
- **Single-node JSON store** (`data/bonuses.json`, atomic writes). Fine at this scale; move to
  Postgres/SQLite if concurrent writers ever appear.

## Deploy

The app is Railway-ready (`start` script, `PORT` respected, `engines: node >= 20`,
one native dep (better-sqlite3, prebuilt binaries), `prestart` seeds the DB). It lives at `aiagentscity.com/benefits`
via reverse proxy with `BASE_PATH=/benefits`. Foolproof steps:
**[RAILWAY_DEPLOY.md](RAILWAY_DEPLOY.md)**.

## Layout

```
src/
  web-server.ts   site + feeds + /mcp (Streamable HTTP) + /api/stats  [npm start]
  site.ts         server-rendered pages: landing, browse, detail, agents, about/disclosure/contact
  stats.ts        live stats computed from the real data
  mcp-tools.ts    MCP tool definitions (shared by stdio + HTTP)
  mcp-server.ts   MCP server (stdio) — `npm run mcp`
  cli.ts          operator CLI (JSON on stdout)
  db.ts           JSON data store + query functions (search/get/expiring/list)
  compare.ts      shared compare logic (MCP + CLI)
  seed.ts         seed loader (validates, upserts AND prunes: seed-data/*.json is the source of truth)
  types.ts        Bonus schema types
  links.ts        apply-URL resolution, toPublic() shaping, disclosure wording
  meta.ts         version constants, server.json + auth.md builders
  freshness.ts    pure source-page classifier (blocked is not dead)
  freshness-cli.ts  daily check runner -> data/review-queue.json (`--canary` proves it can go red)
  tests/          node:test suite (npm run test)
skill/            product skill served over MCP (skill://benefits-city/benefits-city/SKILL.md)
seed-data/        researched offers (bank-account, credit-card, savings JSON files)
data/             bonuses.json (generated by npm run seed / prestart; gitignored)
public/assets/    site.css (no build step)
public/llms.txt   static reference copy (server generates the live one per-host)
screenshots/      headless-Chromium captures of the pages
REFRESH_PLAN.md   how the feed stays fresh
RAILWAY_DEPLOY.md foolproof Railway + reverse-proxy steps
```
