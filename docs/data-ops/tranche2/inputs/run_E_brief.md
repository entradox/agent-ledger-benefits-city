# Run E — Issuer Corroboration Pass (brief for Hermes)

**Date:** 2026-10-02
**Scope:** research only. Do NOT modify seed-data/, source files, or any existing file.
Write your output to:
- `docs/data-ops/tranche2/reports/run_E_issuer_corroboration.json`
- `docs/data-ops/tranche2/reports/run_E_issuer_corroboration.md`

## Task

Benefits City is a live bank/card/brokerage bonus comparison product
(https://aiagentscity.com/benefits). The 19 candidate offers below were found on
bonus trackers (Doctor of Credit etc.) but have NOT been confirmed on the
issuer's own page. For each candidate:

1. Find the issuer's OFFICIAL offer/product page (issuer domain only — no
   tracker/affiliate pages as the primary source).
2. Confirm whether the offer is live as of today (2026-10-02).
3. Extract: exact bonus amount(s) and tiers, requirements (direct deposit,
   balance, debit transactions, etc.), eligibility (states, new-customer rules),
   offer start/end dates, and the canonical offer URL.
4. Mark each record: `status` = corroborated | partially_corroborated |
   not_found | unreachable | expired.
5. If the issuer page is unreachable from this machine, say so explicitly —
   do not substitute tracker data and call it verified.

## Candidates (19)

| # | Issuer | Product | Tracker-claimed bonus |
|---|--------|---------|----------------------|
| 1 | Huntington Bank | Perks / Platinum Perks Checking | $600 |
| 2 | Fifth Third Bank | Essential Checking | $300 |
| 3 | Citizens Bank | One Deposit Checking | $400 |
| 4 | Regions Bank | LifeGreen Checking | $400 |
| 5 | Bank of America | Advantage Plus Banking (checking) | $500 |
| 6 | Citibank | Citi personal checking | $325 |
| 7 | Four Leaf FCU (formerly Bethpage FCU) | Free / Smart / Student Checking | $550 |
| 8 | PSECU | Checking | $300 |
| 9 | FIGFCU | High Yield Checking | $250 |
| 10 | Connexus CU | Xtraordinary Checking | $300 |
| 11 | Capital One | 360 Performance Savings | $1,500 |
| 12 | E*TRADE (Morgan Stanley) | Premium Savings | $800 |
| 13 | Ally Bank | Savings (Refer-a-Friend) | $100 |
| 14 | E*TRADE (Morgan Stanley) | Self-directed brokerage | $6,000 |
| 15 | Public.com | Brokerage / IRA transfer match | $10,000 |
| 16 | Merrill Edge | Self-directed CMA / IRA | $1,000 |
| 17 | Citi | Wealth Management self-directed brokerage | $5,000 |
| 18 | Raisin | Cash account deposit bonus | $1,000 |
| 19 | Delta Community CU | 12-month CD bonus | $100 |

## Output JSON schema

Array of 19 objects:
```json
{
  "issuer": "...",
  "product": "...",
  "tracker_claim_usd": 600,
  "status": "corroborated|partially_corroborated|not_found|unreachable|expired",
  "issuer_bonus_usd": null,
  "requirements_summary": "...",
  "eligibility_notes": "...",
  "offer_start": "YYYY-MM-DD|null",
  "offer_end": "YYYY-MM-DD|null",
  "source_url": "https://issuer-domain/...",
  "notes": "discrepancies vs tracker claim, fetch method used"
}
```

The .md should be a one-paragraph-per-issuer human summary + a short
"recommended for dataset entry" shortlist at the end.
