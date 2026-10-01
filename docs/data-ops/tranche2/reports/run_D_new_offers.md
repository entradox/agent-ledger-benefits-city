# Run D — New Benefits City Offers (discovery)

**Date:** 2026-10-01
**Scope:** Evidence gathering only. Nothing written outside the two report files. No repo writes, no commits, no posts.
**Candidates found:** 19 proposed (17 usable, 2 flagged stale/conflicting)
**Primary discovery source:** Doctor of Credit (bank-account roundup + brokerage roundup + individual post pages), with the Raisin issuer page and Delta Community CU issuer page used directly.

## Coverage vs. the current dataset

Tracked today: 34 ids — 12 bank-account, 21 credit-card, 1 savings, and **zero credit unions, CDs, or brokerage bonuses**.

This run targets exactly those holes:

| Category | Tracked before | Proposed now |
|---|---|---|
| Bank / checking | 12 | 7 |
| Credit union | 0 | 4 |
| Savings | 1 | 3 |
| CD | 0 | 2 |
| Brokerage | 0 | 4 |
| Credit card | 21 | 0 |

No new credit-card candidates were proposed — the card dataset is already the most saturated category (21 of 34) and the brief prioritised the uncovered categories.

---

## 1. Bank / checking bonuses

| Issuer | Offer | Amount | Source | Confidence |
|---|---|---|---|---|
| Huntington Bank | Perks / Platinum Perks Checking | $400 / $600 | [Doctor of Credit](https://www.doctorofcredit.com/oh-mi-pa-ky-wv-huntington-bank-200-checking-promotion-no-direct-deposit-requirement/) | high |
| Fifth Third Bank | Essential Checking | $300 | [Doctor of Credit](https://www.doctorofcredit.com/fifth-third-200-checking-bonus-fl-ga-il-ky-mi-nc-oh-tn-wv/) | high |
| Citizens Bank | One Deposit Checking | $400 | [Doctor of Credit](https://www.doctorofcredit.com/ct-de-ma-mi-nh-nj-ny-oh-pa-ri-vt-citizens-bank-400-checking-bonus-2/) | high |
| Regions Bank | LifeGreen Checking | $400 | [Doctor of Credit](https://www.doctorofcredit.com/regions-bank-400-checking-bonus-50-referral-al-ar-fl-ga-il-in-ia-ky-la-ms-mo-nc-sc-tn-tx-2/) | high |
| Bank of America | Advantage Plus Banking | $500 | [Doctor of Credit](https://www.doctorofcredit.com/best-bank-account-bonuses/) | high |
| Citibank | Citi personal checking | $325 | [Doctor of Credit](https://www.doctorofcredit.com/best-bank-account-bonuses/) | medium |
| Connexus Credit Union | Xtraordinary Checking | $300 / $250 | [Doctor of Credit](https://www.doctorofcredit.com/connexus-credit-union-300-checking-bonus/) | medium |

All four of the national-brand names here (Huntington, Fifth Third, Citizens, Regions) are issuers **not currently tracked at all**, and each is a soft-pull, online-openable offer in a large multi-state footprint.

## 2. Credit-union bonuses — the biggest gap

| Issuer | Offer | Amount | Membership route | Source | Confidence |
|---|---|---|---|---|---|
| Four Leaf FCU (fka Bethpage) | Free/Smart/Student Checking | $550 | **Nationwide, open membership** | [Doctor of Credit](https://www.doctorofcredit.com/four-leaf-federal-credit-union-550-checking-bonus-fka-as-bethpage-federalcredit-union/) | high |
| PSECU | PSECU checking | $300 | PA-only, but nationwide via $20 PRPS membership | [Doctor of Credit](https://www.doctorofcredit.com/pa-only-psecu-100-250-checking-bonus/) | high |
| Farmers Insurance FCU | High Yield Checking | $250 | Nationwide via American Consumer Council | [Doctor of Credit](https://www.doctorofcredit.com/farmers-insurance-federal-credit-union-figfcu-250-checking-bonus/) | high |
| Connexus CU | Xtraordinary Checking | $250-$300 | Nationwide via $5 Connexus Association donation | [Doctor of Credit](https://www.doctorofcredit.com/connexus-credit-union-300-checking-bonus/) | medium |

The eligibility route is the whole point for this category, and each candidate carries it explicitly:

- **Four Leaf FCU** is the cleanest — genuinely nationwide with no donation or association step.
- **PSECU** is the classic "open by donation" case: nominally PA-only, made nationwide by a $20 Pennsylvania Recreation and Park Society membership.
- **Farmers Insurance FCU** is nationwide via American Consumer Council membership.
- **Connexus** is nationwide via a one-time $5 Connexus Association donation; free if you live in select MN/NH/OH/WI counties.

Caveat on Four Leaf and FIGFCU: both are ChexSystems-sensitive, so approval is not automatic.

## 3. Savings / CD

| Issuer | Offer | Amount | Source | Confidence |
|---|---|---|---|---|
| Capital One | 360 Performance Savings | up to $1,500 | [Doctor of Credit](https://www.doctorofcredit.com/capital-one-300-1500-savings-bonus-requires-20000-100000-deposit/) | high |
| E*TRADE | Premium Savings Account (code SAVE800) | up to $800 | [Doctor of Credit](https://www.doctorofcredit.com/etrade-400-savings-bonus-requires-20k-deposit-4-intro-rate/) | high |
| Ally Bank | Savings Account refer-a-friend | $100 | [Doctor of Credit](https://www.doctorofcredit.com/ally-launches-pilot-referral-program-100-50/) | high |
| Raisin (Savebetter) | Deposit bonus across partner CDs + savings | up to $1,000 (+boost) | [Raisin](https://www.raisin.com/en-us/cd-accounts/) + [Doctor of Credit](https://www.doctorofcredit.com/best-bank-account-bonuses/) | medium |
| Delta Community CU | 12-month CD $100 bonus | $100 | [Delta Community CU](https://www.deltacommunitycu.com/home/cd-bonus.html) | low (**expired window**) |

**On the CD gap specifically — this is the weakest result of the run and should be read as such.** Every issuer-direct CD-bonus page located was for an expired window (Delta Community's ran Feb 1 – Mar 31, 2026). The only CD-family bonus confirmed live-and-current is the **Raisin** platform offer, which pays a cash bonus for depositing into partner institutions' CDs and savings — and even that requires the current month's promo code, since the code rolls monthly. Real "open a CD, get a cash bonus" promotions do exist and recur (Delta Community is a recurring example), but they are cyclical and short-window, so this category needs a **scheduled sweep of issuer promotion pages**, not a one-time pull from a tracker roundup.

## 4. Brokerage / transfer bonuses — completely uncovered, high value

| Issuer | Offer | Amount | Hold period | Source | Confidence |
|---|---|---|---|---|---|
| E*TRADE | Self-directed brokerage transfer | up to $6,000 | 12 months | [Doctor of Credit](https://www.doctorofcredit.com/etrade-up-to-3500-brokerage-referral-bonus-25000-1000000-required/) | high |
| Public.com | Unlimited 1% transfer match | up to $10,000+ | 5 years | [Doctor of Credit](https://www.doctorofcredit.com/public-brokerage-up-to-10000-bonus/) | high |
| Merrill Edge | CMA / IRA asset transfer | up to $1,000 | 180 days (top tier) | [Doctor of Credit](https://www.doctorofcredit.com/merrill-edge-brokerage-up-to-1000-cash-bonus-for-moving-over-your-investments/) | high |
| Citi Wealth Management | Self-directed brokerage | up to $5,000 | ~1-3 months | [Doctor of Credit](https://www.doctorofcredit.com/best-brokerage-bonuses-earn-up-to-3500/) | high |

This category carries the largest raw dollar values in the entire dataset and currently has **zero** coverage. The hold periods are the real differentiator: Citi's is the shortest (~1-3 months) and Public's is the longest (5 years). E*TRADE also has a genuine low-capital entry point — $50 for a $1,000 deposit.

## 5. Credit card

**No candidates proposed.** The card dataset already holds 21 of 34 tracked ids; the brief's priority was the three zero-coverage categories, and those produced 17 of the 20 candidates.

---

## Cheapest to verify next

Ordered by cost-to-confirm (issuer page exists, terms are simple, no branch visit or manual process):

1. **Public.com 1% match** — single public terms page; tiers and rate are stated plainly.
2. **Capital One 360 Performance Savings** — confirm promo code BONUS1500 is live on capitalone.com; the Doctor of Credit page itself carries a stale 2023-expiry string, so the code is the one thing to check.
3. **E*TRADE brokerage $6,000** — read the live tier table; the post's title still says $3,500 while the body says $6,000/$10,000.
4. **Ally $100 refer-a-friend** — issuer terms PDF exists; only needs the current window confirmed.
5. **Citi Wealth Management $5,000** — read the live tier table from the post, since the dedicated URL still carries the old $3,500 headline.
6. **Four Leaf FCU $550** — issuer page plus a ChexSystems-sensitivity datapoint.
7. **Raisin** — needs only the current month's promo code; the terms page is already captured.

## Could NOT confirm (flagged, do not add blind)

- **Delta Community CU 12-month CD $100** — the only issuer-direct CD bonus page found, but its published window (Feb 1 – Mar 31, 2026) is **expired**. `confidence: low`. Included to document the category, not to propose.
- **Connexus CU $250/$300** — **conflicting evidence**: the Doctor of Credit post is titled `[Expired]`, the DC change log shows a $250 bonus added 2026-06-18, and a recent Investopedia piece describes a live $300 bonus on the same account. The amount may be $250 in the current cycle. `confidence: medium`.
- **Citibank checking $325/$475** — read from the roundup page only; the dedicated post was not fetched, so tier amounts are tracker-relayed. `confidence: medium`.
- **Raisin** — live per the roundup, but the captured issuer terms page reflects the September window. `confidence: medium`.

## Honest limits on this run

- **19 of 19 candidates are tracker-sourced (Doctor of Credit), not issuer-confirmed.** Only the Raisin and Delta Community CD entries used an issuer page directly. "high confidence" here means the offer terms were read off a fetched, recently-updated tracker post — not that the issuer's live page was checked.
- **No candidate was confirmed on the issuing bank's own page** for the bank/checking group. The roundup is a strong discovery source and Doctor of Credit explicitly does not use affiliate links, but the offers still need issuer corroboration before entering the dataset.
- **Two candidates carry expired or stale expiry dates** (Huntington's displayed 2026-09-30 window had passed at capture; Delta Community's is expired outright). Doctor of Credit notes that several of these promotions expire earlier than their stated date.
- **The CD category is not really solved.** One live platform-level CD-family bonus and one expired issuer bonus is thin evidence for a category that is genuinely zero-covered. It needs a recurring issuer-page sweep.
