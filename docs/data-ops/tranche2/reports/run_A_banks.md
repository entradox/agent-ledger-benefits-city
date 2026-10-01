# Run A — Bank-account offer verification (checked 2026-10-01)

Written by Hermes from the Run A agent's verified content (the agent hit its iteration cap before writing
files). Every quoted fact below was re-checked by Hermes where it drives a data change.

| id | still live | bonus | method | confidence |
|----|-----------|-------|--------|-----------|
| associated-bank-checking-600 | yes | up to $600 | issuer_page | high |
| bmo-checking-600 | yes | up to $600 | aggregator_consensus | medium |
| us-bank-smartly-checking-450 | yes | up to $450 | issuer_page | high |
| pnc-virtual-wallet-performance-select-400 | yes | up to $400 | issuer_page | medium |
| sofi-checking-savings-400 | yes | up to $400 | issuer_page | high |
| keybank-key-smart-checking-300 | yes | $300 | issuer_page | high |
| capital-one-360-checking-250 | yes | $250 | issuer_page | high |

**All 7 offers still live.** 6 confirmed on the issuer's own page today; 1 (BMO) only via tracker consensus.

## Mismatches and surprises

- **Associated Bank's $600 is the TOP TIER, not the headline payout.** *Independently re-verified by Hermes
  against the issuer page.* The page's own table: average daily balance $1,000–$4,999.99 = **$300**;
  $5,000–$9,999.99 = $400; $10,000+ = **$600**. The qualifying action alone (direct deposits of $500+ in
  90 days) earns **$300**. We rank and sort offers by `bonus_amount_usd`, so storing 600 puts this at the
  top of "biggest bank bonuses" when a normal applicant gets $300 — and it needs a five-figure balance in
  *all* Associated deposit accounts to reach the top tier.
- **Associated Bank states list is understated.** Stored `states_available` = [WI, IL, MN]; the issuer page
  lists online new-customer availability in IA, IL, IN, KS, MI, MN, MO, OH, WI (9 states).
- **Associated Bank minimum deposit is a range, not $100.** Page states $25 (Access Checking) / $100
  (Balanced or Choice); stored 100 reflects only the higher accounts.
- **BMO's issuer page is unretrievable and its cache serves EXPIRED terms.** curl 000, browser
  `ERR_HTTP2_PROTOCOL_ERROR`, proxies 522; the cached page showed the expired $400 June 30–Sept 8 offer.
  The current $600 / Sept 9–Dec 15, 2026 terms are tracker-confirmed only.
- **PNC states no geographic availability** on its offer page — the stored 12-state list is unconfirmed
  from source. This matters now that state pages are a real surface: a wrong list produces a wrong page.
- **Capital One 360 Checking shows no expiration date** (stored `null` is correct).
- **KeyBank's page also advertises a Key Select Checking $500 bonus** we do not track.

## Could not verify

- **BMO live issuer page** — blocked (curl 000 / HTTP2 error / proxy 522). Method downgraded to
  `aggregator_consensus`. Re-check before presenting as issuer-verified.
- **PNC state list** — not shown on the issuer page.
- **Direct curl for KeyBank and Capital One** — key.com 000, capitalone.com 200 with 0 bytes; both
  retrieved live via `web_extract` instead.

## Proposed data changes (NOT applied — awaiting review)

1. `associated-bank-checking-600`: `states_available` → the 9 listed states; `min_deposit_usd` → 25.
2. `associated-bank-checking-600`: consider storing the **base $300** as the ranked value with the tiering
   in `requirements`, or adding a `bonus_max_usd`. Storing the top tier as the sort key is a
   ranking-integrity issue, not a typo — it silently reorders every "biggest bonus" page and answer.
3. `pnc-...`: leave the state list but flag it as issuer-unconfirmed rather than presenting it as sourced.
