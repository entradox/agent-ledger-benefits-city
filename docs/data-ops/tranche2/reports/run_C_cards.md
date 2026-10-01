# Run C — Card verification: Citi, Capital One, Wells Fargo, BofA (checked 2026-10-01)

Written by Hermes from the Run C agent's verified content (the agent hit its iteration cap before writing
files). The load-bearing citation finding was independently re-verified by Hermes.

**Result: 6/6 offers confirmed live on issuer pages, fetched today.** No URL hard-blocked. The barrier was
*rendering*: citi.com, bankofamerica.com and capitalone.com inject bonus figures via JavaScript, so raw
`curl` text came back with `$ ____` blanks — resolved with a rendered browser read plus `web_extract`.

| id | public offer confirmed | stored | match | confidence |
|---|---|---|---|---|
| citi-strata-elite-75k | 75,000 pts / $6,000 / 3mo / $595 fee | 75,000 / $6,000 / $595 | terms ✅ · source_url ❌ | high |
| citi-strata-premier-60k | 60,000 pts / $4,000 / 3mo / $95 fee | 60,000 / $4,000 / $95 | terms ✅ · source_url ❌ | high |
| capital-one-venture-x-75k | 75,000 mi / $4,000 / 3mo / $395 fee | 75,000 / $4,000 / $395 | ✅ | high |
| wells-fargo-autograph-journey-60k | 60,000 pts / $4,000 / 3mo / $95 fee | 60,000 / $4,000 / $95 | ✅ | high |
| bofa-premium-rewards-elite-75k | 75,000 pts = $750 / $5,000 / 90d / $550 fee | 75,000 / $750 / $550 | ✅ | high |
| bofa-premium-rewards-60k | 60,000 pts = $600 / $4,000 / 90d / $95 fee | 60,000 / $600 / $95 | ✅ | high |

## Mismatches

1. **Both Citi rows cite a source that does not support them.** `citi-strata-elite-75k` and
   `citi-strata-premier-60k` both point at
   `awardwallet.com/news/citi-thankyou-rewards/japan-airlines-transfer-partner/`. **Independently
   re-verified by Hermes 2026-10-01**: that page is a 2026-09-20 news article about Japan Airlines
   Mileage Bank becoming Citi's 22nd transfer partner, plus a 30% transfer bonus through Oct 24, 2026.
   It contains **no 75k offer, no 60k offer, no spend requirement, no annual fee** — zero offer terms.
   It does link out to the Citi Strata Elite and Premier card pages, which is how the citation likely
   got attached. **The offers themselves are correct; the citation is wrong.** This is the failure mode
   to watch: a record that *looks* sourced but is not.
2. **`bonus_amount_usd` is a third-party cents-per-point derivation, not an issuer-stated number.**
   Citi Elite stores $1,425 (@1.9c) vs the issuer's "nearly $1,500 in value"; Wells Fargo stores $1,050
   (@1.75c) vs the issuer's $600 cash; Capital One stores $1,388 (@1.85c) vs the issuer's $750 travel.
   Only BofA's $750 and $600 match issuer wording exactly.
3. **Citi Elite eligibility is wrong.** Stored text applies a "past 48 months" rule; the **Elite** page
   states only "not available if you currently have or previously had a Citi Strata Elite account". The
   48-month window belongs to the **Premier** page. Stored Elite also omits the $200 Splurge and $200
   Blacklane credits.

## Bad or weak sources found

- `citi-strata-elite-75k`, `citi-strata-premier-60k` → a JAL transfer-partner news article (**no offer
  terms at all**). Highest-severity finding in this run.
- `bofa-premium-rewards-60k` → `bankofamerica.com/credit-cards/?graffiti=true`, a generic card landing
  page with tracking params, not the product page.
- `capital-one-venture-x-75k` → a financebuzz.com affiliate landing page instead of the issuer.
- `wells-fargo-autograph-journey-60k` → a marketing landing URL with tracking parameters (terms agree).

## Could not verify

- No expiry date is shown on any of the six issuer pages (`expiry_date_shown: null` for all).
- `targeted_or_incognito_only` is unresolved for both Citi rows: the pages say "not available if you
  leave this page" and offer a soft pre-qualify check, which is consistent with page-specific targeting
  but not proof of it.

## Proposed data changes (NOT applied — awaiting review)

1. Replace the two Citi `source_url` values with the issuer product pages.
2. Fix Citi Elite's eligibility text (drop the 48-month rule; add Splurge/Blacklane credits).
3. Decide the `bonus_amount_usd` basis: either store the **issuer-stated** cash value, or label the
   derived value as an estimate wherever it is ranked or displayed. This affects every "biggest bonus"
   ordering, same class of issue as Associated Bank's top-tier-as-headline.
