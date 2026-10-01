# Benefits City — an AI Agent City project

US **bank account opening bonuses** and **credit card signup bonuses**, verified
by hand — served two ways:

| Audience | Interface | How |
|---|---|---|
| **Humans** | Server-rendered site: landing, filterable browse, bonus detail pages, agent docs | `npm start` → `/`, `/bonuses`, `/bonuses/:id`, `/agents` |
| **Agents** | MCP server — 4 tools over **Streamable HTTP** (`POST /mcp`) and **stdio** | `npm start` → `/mcp` · `npm run mcp` |
| **Agents** | JSON feeds + `llms.txt` | `/api/bonuses.json`, `/api/bonuses/:id`, `/api/stats`, `/llms.txt` |
| **Operators** | CLI, same data/logic as MCP, JSON on stdout | `npm run cli -- …` |

One database, two first-class interfaces. Live stats on the landing page are
computed from the real data — they can't go stale.

## Install & run

```bash
cd ~/workspace/bank-bonus-agent
npm install --ignore-scripts   # pure-JS deps; --ignore-scripts avoids native/binary postinstalls
npm run build                  # tsc -> dist/
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
no API key:

```
POST {PUBLIC_URL}/mcp
```

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
| `search_bonuses` | `bonus_type?` (`bank_account`\|`credit_card`), `state?` (2-letter code; nationwide always matches), `min_bonus_amount_usd?`, `direct_deposit_required?`, `query?` (bank/product substring), `limit?` (1–100, default 25) | Array of bonus records, highest bonus first |
| `get_bonus` | `id` | Full record, or error on unknown id |
| `expiring_soon` | `days?` (1–365, default 30) | Records with stated expiry inside the window, soonest first. No-stated-expiry offers excluded |
| `compare_bonuses` | `ids` (2–4) | `{ bonuses: [...], summary: { highest_bonus_usd, earliest_expiry } }`, or error listing unknown ids |

Tool definitions live in `src/mcp-tools.ts`, shared by the stdio server and the
Streamable HTTP transport so the contract can't drift. (Stateless HTTP follows
the SDK pattern: one fresh server + transport per request.)

## Data schema (per record)

`id` (kebab-case) · `bank_or_issuer` · `product_name` · `bonus_type` ·
`bonus_amount_usd` (bank accounts: advertised bonus; credit cards: **estimated USD value of the points/miles bonus — valuation basis stated in `requirements`**) ·
`bonus_points` · `annual_fee_usd` · `requirements[]` (plain-English qualifying steps) ·
`min_deposit_usd` · `direct_deposit_required` · `expiry_date` (`YYYY-MM-DD`, null = no stated end) ·
`states_available` (`"nationwide"` or state-code array) · `application_url` ·
`source_url` (where live terms were confirmed) · `last_verified_date`.

## Seed data provenance

29 records, all verified live on **2026-09-20** (14 bank account, 15 credit card). Every record
carries `source_url` + `last_verified_date`; nothing was invented — unverifiable offers were skipped.
The 8 soonest-expiring offers were re-verified the same day; see `REFRESH_PLAN.md`.

Known caveats: for Chase and Wells Fargo no verbatim official offer-page URL surfaced, so
`application_url` points at the page where terms were confirmed; BMO's record uses a Doctor of
Credit page for both URL fields. Swap in true bank URLs / affiliate links later.

## What's stubbed (deliberately)

- **`application_url` = official offer pages, not affiliate links.** The user signs up for bank
  affiliate programs themselves; swap URLs when approved (marked `AFFILIATE_PLACEHOLDER`
  in `src/site.ts`; also update the disclosure page's "Current status" section).
- **No automated refresh.** Re-verification is a manual/scripted cadence — see
  [REFRESH_PLAN.md](REFRESH_PLAN.md).
- **Single-node JSON store** (`data/bonuses.json`, atomic writes). Fine at this scale; move to
  Postgres/SQLite if concurrent writers ever appear.

## Deploy

The app is Railway-ready (`start` script, `PORT` respected, `engines: node >= 20`,
zero native deps, `prestart` seeds the DB). It lives at `aiagentscity.com/benefits`
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
  seed.ts         seed loader (validates + upserts seed-data/*.json)
  types.ts        Bonus schema types
seed-data/        researched offers (bank-account-bonuses.json, credit-card-bonuses.json)
data/             bonuses.json (generated by npm run seed / prestart; gitignored)
public/assets/    site.css (no build step)
public/llms.txt   static reference copy (server generates the live one per-host)
screenshots/      headless-Chromium captures of the pages
REFRESH_PLAN.md   how the feed stays fresh
RAILWAY_DEPLOY.md foolproof Railway + reverse-proxy steps
```
