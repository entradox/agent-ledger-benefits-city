# Run B — Credit Card Offers Verification (Amex / Chase / Discover)

- **Checked:** 2026-10-01 (America/New_York)
- **Input:** `docs/data-ops/tranche2/inputs/verify_run_B_cards_amex_chase.json` (7 offers)
- **Method:** direct `curl` to issuer pages (Chase, Discover, Amex) + reputable trackers (Doctor of Credit, The Points Guy, UpgradedPoints, WalletHub)
- **Result:** offers live = 7/7 · stored values reproduced publicly = **5/7** · clear mismatches = **2**

## Public offer confirmed vs stored

| id | public offer confirmed today | stored value | match? | confidence |
|---|---|---|---|---|
| amex-business-platinum-300k | **200,000** pts after $20,000/3mo (public); 250k–300k is **targeted/YMMV only** | 300,000 pts / $6,000 | **NO** (300k not public) | high |
| amex-business-gold-200k | 200,000 pts after $15,000/3mo (may need a referral link) | 200,000 pts / $4,000 | YES | high |
| amex-platinum-175k | Up to 175,000 pts after $12,000/6mo (issuer's own generic text read 150,000) | 175,000 pts / $3,500 | YES (variable) | high |
| amex-gold-100k | As high as 100,000 pts after $8,000/6mo (3 trackers) | 100,000 pts / $2,000 | YES (variable) | medium |
| chase-sapphire-reserve-100k | **100,000** pts after $6,000/3mo — issuer page | 100,000 pts / $2,050 | YES | high |
| chase-sapphire-preferred-75k | **75,000** pts after $5,000/3mo — issuer page | 75,000 pts / $1,538 | YES | high |
| discover-it-cash-back-match | Unlimited uncapped Cashback Match, $0 min — issuer page (**no fixed $ bonus**) | $525 (WalletHub estimate) | **NO** (no issuer value) | high (terms) / low ($525) |

## Mismatches

1. **amex-business-platinum-300k — 300,000 pts is a targeted-only offer.** Doctor of Credit's page (fetched 2026-10-01) lists the *public* Business Platinum offer as **200,000 pts after $20,000/3mo**, and files “American Express Business Platinum 250,000–300,000 Points” under a **separate YMMV/Targeted Offers** section. TPG headlines “as high as 300,000” but hedges “welcome offers vary, and you may not be eligible.” The stored 300,000/$6,000 is the ceiling of a targeted offer, not a public one — public value is 200,000 (~$4,000).
2. **discover-it-cash-back-match — $525 is a third-party estimate, not a Discover figure.** Discover publishes *no* fixed dollar bonus for the it Cash Back; the offer is an **uncapped dollar-for-dollar match** of year-one cash back, “No purchase minimums,” with “no limit.” The $525 came from a WalletHub estimate and cannot be reproduced as an issuer value. Also, the stored `source_url` is a financebuzz.com affiliate landing page, not Discover.

Secondary flag (not counted as a mismatch): **amex-platinum-175k** — Amex's own page served the generic text “find out your offer, which could be **150,000 points**” to this bot, so 175,000 is the elevated/variable figure rather than a fixed public headline.

## Could not verify

- **American Express welcome-offer numbers (all 4 Amex rows):** `americanexpress.com` returned HTTP 200 but renders the welcome-offer module client-side; the static HTML served to curl contained only the generic prefix (“Welcome Offer: Find out your offer, which could be …”) and no points figure. Issuer terms for the Amex amounts are therefore **not confirmed** — the Amex rows rest on **aggregator consensus** (Doctor of Credit + TPG + UpgradedPoints/WalletHub), dated within the current window.
- **Amex Business Platinum page** loaded but its offer box was not populated for a bot request.
- **AwardWallet** offer page returned HTTP 404 — not used.

## Blocked / substitutions

- No issuer hard-blocked. **Amex did not 403** — it returned 200 but is JavaScript-rendered, so the welcome-offer figure was unreachable from static HTML → substituted **Doctor of Credit** (public vs targeted separation) and **The Points Guy** (elevated offers table).
- **Chase** and **Discover** served fully as issuer pages → used directly (`method: issuer_page`); Discover it-card FAQ pulled via `web_extract`.
- **doctorofcredit.com**, **thepointsguy.com**, **upgradedpoints.com**, **wallethub.com** all reachable via curl / web_extract.

## Method notes

- Amex rows: `method = aggregator_consensus`. Chase + Discover rows: `method = issuer_page`. No row is `unverified`.
- The stored Chase values reproduce **verbatim** from the issuer's own offer-details text (CSR: 100,000/$6,000/3mo/$795; CSP: 75,000/$5,000/3mo/$95). The only Chase nuance is the points **valuation basis** (stored uses TPG 2.05 cpp; Chase itself states $2,000 for the CSR offer and 1.5 cpp travel redemption for the CSP).
- Amex annual fees ($895 / $375 / $895 / $325) and spend windows reproduce; only the Business Platinum headline number does not.
