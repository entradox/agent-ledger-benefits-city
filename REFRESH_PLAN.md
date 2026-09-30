# Refresh Plan — keeping the bonus feed fresh

Bank bonuses are perishable: offers expire, amounts change, requirements get rewritten.
Stale bonus data is worse than no data — an agent recommending a dead $500 offer destroys
trust. This plan keeps every record honest.

## Cadence

| Task | Frequency | Driver |
|---|---|---|
| Re-verify offers expiring within 30 days | **Weekly** | `expiring_soon({days: 30})` is the priority queue |
| Re-verify all records | **Monthly** | oldest `last_verified_date` first |
| New-offer sweep (new promos, increased bonuses) | **Weekly** | affiliate network feeds + aggregator tripwires |
| Drop dead offers | Immediately on confirmation | expired `expiry_date` + failed re-verification → remove or mark expired |

SLA: no record served with `last_verified_date` older than 30 days; nothing expiring
within 14 days without a same-week re-check.

## Data sources (in priority order)

1. **Affiliate network APIs** — Impact, Awin (and later CJ/Rakuten) bank programs. Once the
   user is approved as a publisher, these give structured, near-real-time offer data
   (payout, terms, expiry, creative URLs) straight from the banks. This is the long-term
   primary pipe — and the monetization path (per-account bounties).
2. **Official bank promo pages** — the `application_url` on each record. Re-check terms
   manually or with a fetch-and-diff script. Respect robots.txt and each site's ToS;
   never scrape a site that disallows bots — fall back to the bank's official page or
   aggregator listings.
3. **Aggregator tripwires** — Doctor of Credit, HustlerMoneyBlog "best bank bonuses" pages.
   Useful for *detecting* new/changed offers, not as the source of truth; always confirm
   against the bank's page before publishing.

## Re-verification process

1. Pull the priority queue: `node dist/cli.js expiring --days 30` (weekly) or the full
   feed sorted by `last_verified_date` (monthly).
2. For each record: fetch `source_url` / `application_url`, confirm amount, requirements,
   expiry, state availability.
3. Changed → update the seed JSON, bump `last_verified_date`, `npm run seed` (upsert by id).
4. Dead → remove the record from seed JSON and re-seed, or keep with `expiry_date` in the
   past so `expiring_soon` naturally drops it (past expiries are excluded).
5. New offer → add a record with `source_url` + `last_verified_date`, re-seed.

## Verification confidence and bot-blocked pages (learned 2026-09-20)

Several official bank pages block automated fetching (53.com/Fifth Third, Wells Fargo's
bonus page, Chase's offer pages, Amex's JS-heavy card pages). When the official page
can't be fetched:
- **Multi-aggregator consensus counts as verified**: 3+ reputable listings
  (WalletHacks, Frequent Miler, The Points Guy, HustlerMoneyBlog, BankCheckingSavings,
  CreditDonkey, Doctor of Credit) agreeing on amount/terms/expiry, crawled within days,
  and matching the bank's indexed page content where available (Google-indexed text of
  the official URL is a strong corroboration signal).
- Note the limitation in the record's provenance thinking — prefer a directly-fetched
  official page as `source_url` wherever possible; fall back to the most reputable
  aggregator page actually verified.
- A bot-error page on the official site ("Oops, something went wrong") does **not**
  mean the offer is dead — confirm via aggregators before removing a record.

## Automated freshness (D-1518)

`npm run freshness` (`node dist/freshness-cli.js`) is the deterministic daily check. No LLM.

- Reads the served store, fetches each record's `source_url` politely (robots.txt respected,
  2s spacing, identifiable user agent), and classifies: `ok`, `expired`, `amount_missing`,
  `changed`, `gone`, `blocked`, `unreachable`.
- It **never edits records**. It writes `data/review-queue.json` (and `data/freshness-state.json`
  for change detection). A human or agent resolves the queue by editing `seed-data/` and re-seeding.
- **Blocked is not dead.** Issuer pages (Chase, Wells Fargo, Fifth Third, ...) routinely block bots.
  `blocked` and `unreachable` are informational and fall back to the multi-aggregator consensus
  tier above; only `expired`, `amount_missing`, `changed`, `gone` are actionable.
- Exit codes: `0` nothing actionable - `1` a human must look - `3` broken / no data at all
  (never a pass). `--canary` proves the classifier can go RED on known-bad input.
- Seed files are the single source of truth: `npm run seed` upserts **and prunes**, so a renamed or
  removed offer cannot linger in the served store.

## Compliance notes

- **Affiliate disclosure:** when affiliate links go live, every surface (feed records,
  llms.txt, MCP tool descriptions) must disclose the affiliate relationship (FTC
  endorsement guidelines). Add an `affiliate_disclosure` note to the schema at that point.
- **No scraping of blocked sites.** If a bank or aggregator blocks automated access,
  use their official pages/APIs or skip — never route around it.
- **Not financial advice.** Keep the existing disclaimer on all surfaces; terms change
  and agents should surface `source_url`/`last_verified_date` to end users.
