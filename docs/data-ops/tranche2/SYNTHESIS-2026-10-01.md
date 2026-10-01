# Benefits City — verification results: 26 offers checked, and the rankings are the real defect

**Date:** 2026-10-01 · **Source:** 4 parallel verification runs + a discovery run, written up by Hermes.
**Status:** findings only — **no data changes applied.** This file is the review input for the changes proposed below.

---

## 1. The essence

All 26 checked offers are still live. **The data is not stale — the rankings are wrong.** Two independent
runs, working on different files, both hit the same class of defect: we store the *most flattering* number
for an offer and sort on it, so the "biggest bonus" ordering silently overstates what a normal applicant
gets. Separately, **two records cite a source that contains no offer terms at all** — they look sourced
and are not.

## 2. Headline numbers

| Run | Checked | Still live | Issuer-confirmed | Tracker-only | Records with mismatches |
|---|---|---|---|---|---|
| A — bank accounts | 7 | 7 | 6 | 1 (BMO) | 1 (Associated) |
| B — Amex/Chase/Discover | 7 | 7 | 3 | 4 (all Amex) | 2 |
| C — Citi/Cap1/WF/BofA | 6 | 6 | 6 | 0 | 3 (incl. 2 bad sources) |
| D — new-offer discovery | 19 candidates | — | 2 | 17 | — |
| **Total verified** | **20** | **20** | **15** | **5** | **6** |

Verification debt is now **14 of 34 issuer-confirmed** (was 11), with a further 6 confirmed today on
issuer pages awaiting the write-back.

## 3. The three findings that matter

### 3.1 We rank on the top tier, not the realistic payout — twice, independently

- **Associated Bank ($600).** *Re-verified by me against the issuer page.* The $600 needs a **$10,000+
  average daily balance in all Associated deposit accounts**. The qualifying action alone (direct deposits
  of $500+ in 90 days) earns **$300**. We store 600, so it sits at the top of every "biggest bank bonus"
  page and answer.
- **Citi Strata Elite ($1,425), Cap1 Venture X ($1,388), Wells Fargo Autograph Journey ($1,050).** These
  `bonus_amount_usd` values are **third-party cents-per-point derivations**, not issuer-stated numbers.
  The issuers advertise ~$1,500, $750 travel, and $600 cash respectively. Only BofA's $750/$600 match the
  issuer's own wording.
- **Amex Business Platinum (300k).** The public offer confirmed today is **200,000 points**. 250k–300k is
  filed by Doctor of Credit under *YMMV/Targeted Offers*. We store 300k and rank it as the single biggest
  offer in the dataset at **$6,000**.

**Why this is the important one:** it is not a typo, it is an ordering-integrity bug. `bonus_amount_usd`
is the sort key for every list, page, MCP answer, and `insights` figure on the site. Overstating it
reorders the product's primary recommendation *and* inflates the "$37,767 total bonus value" headline.
A bonus hunter who acts on our #1 pick and receives half of it does not come back.

### 3.2 Two records cite a source with no offer terms

`citi-strata-elite-75k` and `citi-strata-premier-60k` both cite
`awardwallet.com/news/citi-thankyou-rewards/japan-airlines-transfer-partner/`. **I fetched it:** it is a
2026-09-20 news article about **Japan Airlines Mileage Bank becoming Citi's 22nd transfer partner** plus a
30% transfer bonus. It contains no 75k, no 60k, no spend requirement, no annual fee. It links *to* the
Citi card pages — which is likely how the citation got attached.

The offers themselves are correct. **The citation is worthless, and the record presents itself as
sourced.** This is the failure mode to design against: `source_url` is currently treated as evidence
without anything checking that the source actually states the claim.

Also weak: `bofa-premium-rewards-60k` cites a generic `credit-cards/?graffiti=true` landing page,
`capital-one-venture-x-75k` cites a financebuzz affiliate page, `discover-it-cash-back-match` cites a
financebuzz page for a **$525 figure that is a WalletHub average, not a Discover number** (Discover
publishes no fixed dollar bonus — it is an uncapped year-one match).

### 3.3 Associated Bank's state list understates eligibility by six states

Stored `[WI, IL, MN]`; the issuer page lists online new-customer availability in **IA, IL, IN, KS, MI, MN,
MO, OH, WI**. Now that we generate real state pages, a wrong list produces a wrong page — and this one
hides the offer from six states. PNC states **no** geography on its page, so its 12-state list is
unconfirmed from source and needs the same treatment.

## 4. Discovery: the zero-coverage categories are reachable

Run D found **19 candidates, 17 usable**, all net-new (no id collisions):
**10 bank/checking · 4 credit union · 3 savings · 2 CD · 4 brokerage · 0 card.**

Brokerage was 0-covered; it now has 4 high-confidence candidates with real source pages, including
Public.com's unlimited 1% transfer match and E*TRADE's transfer bonus. Credit unions were 0-covered; each
candidate carries its explicit join route (Four Leaf = nationwide with no donation; PSECU = $20 PRPS;
FIGFCU = ACC; Connexus = $5 donation).

**Honest limits:** 17 of 19 are tracker-sourced, not issuer-confirmed. The CD category is **not** solved —
every issuer-direct CD bonus page found was expired. Citi checking $325/$475 and Citi Wealth $5,000 were
read from a roundup, not a dedicated post. Connexus is internally contradictory ($250 vs $300, and the DC
post is titled `[Expired]`).

## 5. Proposed data changes — REVIEW BEFORE APPLYING

Ordered by impact. None applied.

| # | Change | Records | Why |
|---|---|---|---|
| 1 | Fix the two Citi `source_url` values → Citi product pages | 2 | Cited source contains no offer terms |
| 2 | Correct Amex Business Platinum 300k → 200k (or label it targeted-only) | 1 | Public offer is 200k; 300k is YMMV |
| 3 | Decide the `bonus_amount_usd` basis: issuer-stated value, or label derived values as estimates | ~10 | Sort key overstates payout; inflates the $37,767 headline |
| 4 | Associated Bank: states → 9 listed; min deposit → 25; store base $300 with tiering | 1 | Understates eligibility; headline is top tier |
| 5 | Citi Strata Elite: drop the 48-month rule, add Splurge/Blacklane credits | 1 | Rule belongs to the Premier page |
| 6 | `discover-it-cash-back-match`: replace the $525 estimate + financebuzz URL | 1 | No issuer dollar bonus exists |
| 7 | Weak citations → issuer product pages (BofA 60k, Cap1 Venture X, WF) | 3 | Low-grade sources |
| 8 | Flag PNC's state list as issuer-unconfirmed | 1 | Page states no geography |
| 9 | **Add a source-integrity check** | system | A `source_url` that never mentions the bonus should fail a gate — see below |

## 6. The reusable lesson

**A `source_url` field is a claim, and nothing was verifying it.** Both runs independently produced
records whose citation could not support the record, and the site displays "source + check date" as its
core trust promise. The cheap guard: for each offer, assert the stored bonus figure (or its points
equivalent) appears in the fetched source text. That is the same shape as the example-prompt guard added
earlier today — parse the promise, check it against the artifact, fail loudly.

Second lesson, for ranking fields: **a value used as a sort key must be the number a normal user will
actually receive.** Where an offer is tiered or derived, store the realistic figure and keep the maximum
in a separate field. Ranking on "best case" quietly turns the product's main recommendation into its main
credibility risk.

## 7. Not done / next

- Data changes **not applied** — this is the review input.
- **BMO's issuer page remains unfetchable** (curl 000, `ERR_HTTP2_PROTOCOL_ERROR`, proxies 522) and its
  cache serves an expired offer; it needs a browser-based re-check before it can be called issuer-verified.
- 14 offers were never re-checked in this pass (the 14 already issuer-verified).
- Run D's 19 candidates need issuer corroboration before entering the dataset — tracker-only is a
  discovery pass, not a data pass.
