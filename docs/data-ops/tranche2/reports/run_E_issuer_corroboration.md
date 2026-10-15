# Run E — Issuer Corroboration Pass

**Date:** 2026-10-02
**Scope:** research only. No seed-data or source files were modified. Output written to
`docs/data-ops/tranche2/reports/run_E_issuer_corroboration.json` (19 records) and this file.

**Method:** Each candidate was traced to the issuer's own domain. Pages were fetched with the
web-extract tool; where the keyless extractor failed, the page was loaded in a real browser and
its rendered text read directly. Where an issuer page could not be loaded at all, that is stated
explicitly and no tracker data was substituted (per the brief).

**Status rollup:** corroborated = 10 · partially_corroborated = 4 · expired = 4 · unreachable = 1
(0 = not_found).

| # | Issuer | Product | Claim | Status | Issuer value |
|---|--------|---------|-------|--------|--------------|
| 1 | Huntington Bank | Perks / Platinum Perks Checking | $600 | expired | $600 (window closed 9/30/26) |
| 2 | Fifth Third Bank | Essential Checking | $300 | unreachable | — (page blocked) |
| 3 | Citizens Bank | One Deposit Checking | $400 | expired | $400 (window closed 8/30/26) |
| 4 | Regions Bank | LifeGreen Checking | $400 | partially_corroborated | not shown on issuer page |
| 5 | Bank of America | Advantage Plus Banking | $500 | corroborated | $500 (top tier) |
| 6 | Citibank | Citi personal checking | $325 | corroborated | $325 |
| 7 | Four Leaf FCU | Free / Smart / Student Checking | $550 | corroborated | $550 |
| 8 | PSECU | Checking | $300 | corroborated | $300 |
| 9 | FIGFCU | High Yield Checking | $250 | corroborated | $250 |
| 10 | Connexus CU | Xtraordinary Checking | $300 | expired | $250 (window closed 7/12/26) |
| 11 | Capital One | 360 Performance Savings | $1,500 | partially_corroborated | not shown on issuer page |
| 12 | E*TRADE | Premium Savings | $800 | corroborated | $800 |
| 13 | Ally Bank | Savings (Refer-a-Friend) | $100 | corroborated | $100 |
| 14 | E*TRADE | Self-directed brokerage | $6,000 | corroborated | $6,000 (top tier) |
| 15 | Public.com | Brokerage / IRA transfer match | $10,000 | partially_corroborated | 1% match (structure changed) |
| 16 | Merrill Edge | Self-directed CMA / IRA | $1,000 | corroborated | $1,000 (top tier) |
| 17 | Citi | Wealth Management self-directed brokerage | $5,000 | partially_corroborated | $5,000 (advisor product) |
| 18 | Raisin | Cash account deposit bonus | $1,000 | corroborated | $1,000 |
| 19 | Delta Community CU | 12-month CD bonus | $100 | expired | $100 (window closed 3/31/26) |

---

## Per-issuer summary

**1. Huntington Bank — Perks / Platinum Perks Checking ($600).** The issuer's checking-bonus page
confirms a tiered offer: $400 for Perks Checking (receive $500+ in qualifying ACH direct deposits
within 90 days) and $600 for Platinum Perks Checking (deposit $25,000+ in new money within 90
days). The tracker's "Perks / Platinum Perks $600" label conflates the two tiers. The page's own
terms require the account be opened by **September 30, 2026**, which passed two days before this
run, so the offer is **expired** as of 2026-10-02. The page is still being served and trackers have
renewed this offer repeatedly, so re-check for a fresh tranche. Source:
huntington.com/checking-account-promotions-bonuses-offers.

**2. Fifth Third Bank — Essential Checking ($300).** **Unreachable from this machine.** The issuer
offer URL (and multiple other 53.com paths, including the site root) return a Fifth Third error
page ("Oops, Something went wrong"). No issuer content could be loaded via extract or browser. Per
the brief, tracker data was not substituted: the $300 amount and the product name (trackers waver
between "Essential," "Momentum," and "Preferred") are **unconfirmed**. Search indexes show the page
with the title "Get a $300 checking account bonus offer," suggesting it exists behind a block or
geo-filter. Needs a re-fetch from another network.

**3. Citizens Bank — One Deposit Checking ($400).** The issuer page confirms the bundle: $300 for
checking (one $500+ direct deposit within 60 days) plus $100 for savings (three consecutive months
of $100+ deposits and a $300+ balance) = up to $400. However, the page's fine print lists an
account-opening window of **June 15 – August 30, 2026**, so the offer is **expired** as of
2026-10-02. A third-party summary claimed an Oct 25, 2026 expiry that the issuer page does not
support (likely a newer tranche); re-check. Source:
citizensbank.com/promo/checking/special-offer-2026-semc4.aspx.

**4. Regions Bank — LifeGreen Checking ($400).** Partially corroborated. The issuer's
switch-to-Regions promo page is live and confirms an offer exists and that **you must register
before opening the account**. It does not surface the $400 amount or the deposit terms in the
retrieved content, and the LifeGreen product page shows no acquisition bonus. So the offer exists
on the issuer domain, but the **amount and terms are not corroborated there**. Trackers state
$1,000+ ACH direct deposits within 90 days, register by 12/31/26, open by 1/31/27 — plausible but
unverified here. Source: regions.com/promo/switch-to-regions-checking.

**5. Bank of America — Advantage Plus Banking ($500).** **Corroborated** on the issuer's promo page.
Tiered bonus on qualifying direct deposits within 90 days: $100 for $2,000+, $300 for $5,000+,
$500 for $10,000+. Opening deadline **January 31, 2027**. Note a discrepancy: a sibling BofA offer
page shows a Sep 30, 2026 expiry; the tiered page is the newer, longer-dated one — verify which is
current at entry. Source: promotions.bankofamerica.com/en/offers/chooseyourchecking500tiered.

**6. Citibank — Citi personal checking ($325).** **Corroborated** — and live today. The issuer page
(read via browser after the extractor failed) confirms $325 for opening a new Regular Checking
account and receiving two Enhanced Direct Deposits totaling $3,000+ within 90 days, with an
account-opening window of **4/14/26 to 10/26/26**. Bonus posts between day 90 and day 120. Source:
banking.citi.com/cbol/OM/checking/enhanced-direct-deposit-offer/default.htm.

**7. Four Leaf FCU (formerly Bethpage FCU) — Checking ($550).** **Corroborated** on the issuer promo
page. Staged: $350 after a qualified direct deposit of $500+ within 90 days; +$100 at the 12-month
direct-deposit anniversary; +$100 at 24 months. Open window **Feb 2 – Dec 31, 2026**. Caveat for the
dataset: only $350 is realistically payable in the first ~5 months — the rest needs 12 and 24 months
of continued direct deposit. Source: fourleaffcu.com/ppc/checking-promo-550/.

**8. PSECU — Checking ($300).** **Corroborated** on the issuer promo page. Join with code
**2026PROMO**, open a savings and a checking account, and receive two qualifying payroll direct
deposits of $500+ each within 100 days of membership. Promotional window 1/1/26 – 12/31/26 (live).
Source: go.psecu.com/promo.

**9. FIGFCU — High Yield Checking ($250).** **Corroborated** on the issuer page. Tiered: $100 for
$3,000-$14,999 cumulative in 3+ ACH direct deposits, $250 for $15,000+, all within 90 days; promo
code **GHYCHECK**. Open-ended promotion ("starting October 01, 2025 until further notice") — live.
Note the $15,000 cumulative deposit requirement is steep for the top tier. Source:
figfcu.org/high-yield-checking-google-search.

**10. Connexus CU — Xtraordinary Checking ($300).** **Expired.** The issuer's bonus guide shows the
current offer is up to **$250** (tiered on the two-month average daily balance: $5,000-$9,999.99 =
$150, $10,000-$14,999.99 = $200, $15,000+ = $250), with an account-opening window of **6/15/26 –
7/12/26** that has passed. The tracker's $300 maps to an older (Sep–Nov 2025) promotion that is
also expired. The 4.50% APY account itself is live and separate. Source: connexuscu.org/bonus-guide.

**11. Capital One — 360 Performance Savings ($1,500).** **Partially corroborated.** The issuer's
product page (read via both extract and browser) confirms the account is live but displays **no
bonus and no promo code** — the Capital One 360 savings bonus is promo-code/targeted and is not
surfaced publicly. The $1,500 (tiers $300/$750/$1,500 at $20,000/$50,000/$100,000) is widely
reported by third parties as code BONUS1500 but **cannot be corroborated on the issuer domain from
this machine**. Do not enter as issuer-verified. Source:
capitalone.com/bank/savings-accounts/online-performance-savings-account/.

**12. E*TRADE — Premium Savings ($800).** **Corroborated** on the issuer promo page. Code **SAVE800**;
open and fund within 30 days; deposit $20,000+ net-new and maintain for the 45-day maintenance
period. Tiers: $20,000-$99,999 = $400; $100,000+ = $800. Window **9/15/26 – 1/10/27** (live).
Source: us.etrade.com/promo/savings.

**13. Ally Bank — Savings Refer-a-Friend ($100).** **Corroborated** on the issuer's Terms PDF. $100
Welcome Bonus; enroll via a referral Personal Link by **12/31/26**, open within 30 days, and set up
one recurring transfer per month for 3 consecutive months. **Important caveat:** this is a
referral-only offer — it cannot be claimed without a Personal Link from an existing Ally customer,
so it is not directly actionable for a cold user. Source:
ally.com/content/dam/pdf/bank/customer-referral-terms-and-conditions-new-friends.pdf.

**14. E*TRADE — Self-directed brokerage ($6,000).** **Corroborated** on the issuer promo page. Code
**OFFER26**; open one new self-directed (non-retirement) account by **10/31/26** and fund within 60
days. Full tier table confirmed, including $2,000,000-$4,999,999 = $6,000 and $5,000,000+ = $10,000.
Ranking note: $6,000 requires $2M+ deposited and held — a headline tier, not a realistic value for
most users. Source: us.etrade.com/promo/brokerage.

**15. Public.com — Brokerage / IRA transfer match ($10,000).** **Partially corroborated.** The
tracker's flat $10,000 is **stale**: Public's own FAQ states the previous "up to $10,000 cash"
promotion expired 9/9/2025. The live issuer offer (effective 9/14/2026) is an **uncapped 1% match**
on transferred assets plus up to $100 fee reimbursement — a percentage match, not a fixed bonus.
So the offer is live but the claimed amount cannot be corroborated against the current page.
Source: public.com/transfer-account.

**16. Merrill Edge — Self-directed CMA / IRA ($1,000).** **Corroborated** on the issuer offer page.
Code **PR1000/1000BR** enrolls during account opening; fund $20,000+ in net-new assets within 45
days and maintain 90 days. Tiers: $100 ($20k-$49,999), $200 ($50k-$99,999), $400 ($100k-$249,999),
$1,000 ($250,000+). The $1,000 top tier requires BofA Rewards enrollment at day 90. Note:
merrilledge.com/offers/1000 is a 404; the live page is /offers/pr1000. Two public codes (600ME and
1000BR) have different tier tables — choose by balance. Source: merrilledge.com/offers/pr1000.

**17. Citi — Wealth Management self-directed brokerage ($5,000).** **Partially corroborated.** The
$5,000 top tier belongs to the **advisor-enrolled Citi Personal Wealth Management** product
($2,000,000+ new-to-Citi funds). The tracker label conflates two products: the self-directed "Citi
Self Invest" bonus is up to $1,000, while $5,000 is the advisor-led Wealth Management tier. Citi's
investing pages exist but blocked automated extraction here, so the amount could not be read off
the issuer page. Source: online.citi.com/US/nga/investing.

**18. Raisin — Cash account deposit bonus ($1,000).** **Corroborated** on the issuer page. Promo code
**STACK**; deposit $10,000+ within 14 days and hold for 90 days. Welcome tiers $40/$100/$200/$425/$900
on $10k/$25k/$50k/$100k/$200k, plus an optional Savings+CD Boost (up to +$100), reaching ~$1,200
combined. Registration window September 1 – October 31, 2026 (live). Headline "up to $1,000" maps to
the welcome-bonus tiers. Source: raisin.com/en-us/stack.

**19. Delta Community CU — 12-month CD bonus ($100).** **Expired.** The issuer page confirms the $100
bonus for a 12-month CD with $10,000+, no promo code required — but the offer window is **February 1
– March 31, 2026**, which closed ~6 months before today. The page is stale (still serving an expired
promotion). A separate Delta Community $300 new-member checking offer exists (window 9/1/26 –
10/31/26) but is invitation-only and a different product. Source:
deltacommunitycu.com/home/cd-bonus.html.

---

## Recommended for dataset entry (shortlist)

These are **live as of 2026-10-02**, **corroborated on the issuer's own domain**, and carry a
verifiable amount. Ranked by confidence and by how reachable the offer is for a cold user.

1. **Bank of America — Advantage Plus Banking, $500** (top tier, $10,000+ DD). Tiered $100/$300/$500.
   Live to 1/31/27. National. *Best all-round entry.*
2. **Citibank — Regular Checking, $325.** Two EDDs totaling $3,000+ within 90 days. Live to 10/26/26.
   *Clean, high-confidence, time-limited.*
3. **PSECU — Checking, $300.** Code 2026PROMO; two $500+ payroll DDs in 100 days. Live to 12/31/26.
4. **E*TRADE — Premium Savings, $800** ($100k+ tier) / $400 ($20k). Code SAVE800. Live to 1/10/27.
5. **Merrill Edge — CMA/IRA, $1,000** ($250k+ tier, needs BofA Rewards). Code PR1000. No printed end date.
6. **FIGFCU — High Yield Checking, $250.** Code GHYCHECK; $15,000+ cumulative DD — steep but live/open-ended.
7. **Four Leaf FCU — Checking, $350 realistic** (headline $550 over 24 months). Open to 12/31/26.
   *Enter with a note that $550 is a multi-year figure.*
8. **E*TRADE — Self-directed brokerage, $6,000** ($2M+ tier). Code OFFER26. Live to 10/31/26.
   *Enter as top-tier only.*
9. **Raisin — Cash bonus, up to $1,000** (welcome) / ~$1,200 w/ boost. Code STACK. Live to 10/31/26.
10. **Ally Bank — $100** — corroborated but **referral-only**; enter flagged as not cold-actionable.

**Hold / do not enter as issuer-verified (need a second pass):**

- **Regions ($400)** — offer exists on the issuer domain but amount/terms not shown there; needs the
  registration form or a different issuer page.
- **Capital One ($1,500)** — nothing on the issuer page; promo-code/targeted; third-party only.
- **Public.com ($10,000)** — stale; the live offer is a 1% percentage match, not a fixed $10,000.
- **Citi Wealth ($5,000)** — the figure is the advisor-led product, not the self-directed one the
  tracker names; page blocked extraction. Re-confirm product mapping.
- **Fifth Third ($300)** — issuer page unreachable; re-fetch from another network.

**Do not enter (expired by the issuer's own terms):** Huntington ($600, closed 9/30/26), Citizens
($400, closed 8/30/26), Connexus ($250, closed 7/12/26), Delta Community CD ($100, closed 3/31/26).
Several of these issuers renew on a rolling basis — worth a scheduled re-check rather than a
permanent delete.

---

*No existing files were modified. Report files:*
`docs/data-ops/tranche2/reports/run_E_issuer_corroboration.json`,
`docs/data-ops/tranche2/reports/run_E_issuer_corroboration.md`.
