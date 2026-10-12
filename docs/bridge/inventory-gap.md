# Gap analysis — features + inventory

Frame card **D-1636** · 2026-10-11 · Hermes. Companion to `bankrewards-gap-map.md`
(which holds the ranked P0/P1/P2 bridge plan and the full 18-row feature table).
This file answers one question: **what do they have that we don't — in features and,
above all, in inventory.**

Scope note: this is gap-finding for **our own product**. No clone is being built.
The reference site stops being a thing to copy and becomes a benchmark to close against.

## 1. Inventory — the numbers

Ours: live `GET /benefits/api/bonuses.json` (36 records, 2026-10-11).
Theirs: their own `sitemap.xml` → `sitemaps/offers.xml` (497 offer URLs, 456 distinct
trailing names). Matching is by issuer name with a camel-boundary test, so `Citi` matches
`CitiStrata` but not `CitizensBank`, and `Bank of America` does not match `BankofHope`.
Method and re-runnable script: `docs/bridge/data/inventory_gap.py`.

| Dimension | Ours | Theirs | Gap |
| --- | --- | --- | --- |
| Offers | **36** | **497** | 13.8× |
| Bank accounts | 13 | 400 | 30× |
| Credit cards | 22 | 76 | 3.5× |
| Brokerage | **0** | 21 | **no coverage** |
| Business accounts | **0** | ~57 (their home-page count; 11 business-named pages visible in the sitemap that we lack) | **no coverage** |
| Savings / high-interest | 1 | ~20 national + CD pages | near-zero |
| Distinct issuer / product names | 17 | 456 | 27× |
| Offers whose issuer we also list | — | 71 of their 497 | overlap is 14% of their catalog |
| Offers named for something we don't list | — | **426** | the actual gap |
| State-restricted offers | 7 of 36 (9–18 states each) | most bank pages carry a state list, many single-state | narrower state coverage |

## 2. What the gap consists of — three tiers, three different decisions

**Tier A — categories we have zero coverage in.** Brokerage (19 missing offers, all
national, all online products) and business accounts (their biggest bonuses anywhere:
$1,500, $1,500, $750, $750). This is the highest-value gap per unit of review labour,
because every offer is national and verifiable from the provider's own page.

**Tier B — nationwide quick wins.** Brand-name offers we simply don't list yet. One
verified record each, no state puzzle:
- **Bank:** Key Select Checking **$500**, Key Smart Checking **$300**, Live Oak **$300\***,
  Ally **$100**, BECU **$100**, Chime **$100**, Current **$75**, MoneyLion **$55**,
  One **$50**, Raisin **$40**.
- **High-interest / savings (APY, no bonus):** CIT Platinum **4.25%**, Axos One **4.21%**,
  Raisin **4.15%**, Always.bank **4.10%**, Live Oak **4.00%**, Everbank **3.90%**,
  One **3.75%**, CIT Savings Connect **3.65%**, UFB Portfolio **3.26%**.
- **Brokerage:** Plynk **$250**, Webull **$160 + 12 stocks + 1 month Premium**,
  Moomoo **$100**, Citi **$100**, NinjaTrader **$100**, Ark7 **$50**, J.P. Morgan Chase **$50**,
  Charles Schwab **$50**, eToro **$30**, Public **$20**, Robinhood **$20**, Stash **$5**.
- **Business:** Citizens Bank **$1,500**, Hudson Valley CU **$1,500**, Bank of America
  Business **$750**, Bank of Colorado **$750**, Capital One **$500**, Guaranty **$500**,
  KeyPoint **$500**, Grasshopper **$300**, FSB Bank **$300**, Washington Trust **$250**,
  Firstrust (account offer, no stated bonus).
- **Cards:** the 50 missing are dominated by **airline/hotel co-brand and store cards** —
  United Quest **80k**, Atmos Rewards Summit **80k + 25k companion**, Southwest
  **50k / 85k + Companion Pass / 90k + Companion Pass**, Bilt Palladium **50k + $300**,
  Bilt Obsidian **$200**, plus Delta ×4, Hilton ×4, Marriott ×7, American ×5, JetBlue ×2,
  IHG ×2, Choice ×2, Wyndham, OneKey, Target, Upgrade, and international Avios/Visas.

**Tier C — the long tail: 328 bank pages named for community banks and credit unions**,
mostly serving one state. High verification cost, narrow audience per record. This is the
part of their catalog that exists because they've been at it a long time, and it is **not
a default to chase**. Decision needed, not momentum.

*Values above are quoted from their public category pages on **2026-10-11**, read at
human speed, five pages. They are the reference site's own marketing copy — not verified
terms, and not to be copied into our records without our own verification step.*

## 3. Second inventory dimension — geography

Ours: 29 of 36 offers are nationwide; 7 carry state lists (9–18 states). Theirs: most
bank pages carry a state list and many are single-state (BECU: ID/OR/WA/SC; FSB Bank: IA;
KeyPoint: CA; Washington Trust: RI; Guaranty: MO; Bank of Colorado: CO/NM/AZ; Hudson
Valley: NY). **Our catalog is national-brand-heavy; theirs is national + regional.**
Bridging this means either accepting a national-only product (defensible) or adding
state-restricted offers deliberately, state by state.

## 4. Feature gaps still open

(Full 18-row table, including where we are *ahead*, in `bankrewards-gap-map.md` §Gap table.)

| Feature | Ours | Gap | Bridge |
| --- | --- | --- | --- |
| Search / filters / sort | live (`type`, `state`, `min`, `dd`, `q`, `sort`) | **parity** | — |
| Type listing pages, sitemap, robots, 404 | live | **parity** | — |
| Offer detail depth (tiles + fine print) | 2 sections | thinner than the reference | add bonus/fee/to-qualify/availability/expiry tiles + a real fine-print section |
| Per-state availability display | data present, `state=` filter live | no multi-state display, filter and display not visibly linked | render the state list + keep it in sync with the filter |
| Suggest-an-offer form | absent | no way for strangers to fill our catalog | build it — it directly attacks the Tier C labour problem |
| Report-an-error | absent | no correction loop | build it (they have it; it is also how they keep 497 records honest) |
| Structured data (JSON-LD) | **0 occurrences** | machine-readable product without schema.org markup | emit `Product`/`Offer` per detail page |
| Guides / calculators | absent | no discovery surface | ROI calculator first, then a small guide set |
| Bank Matcher | absent | no guided discovery | 4 steps over `search_bonuses` |
| Newsletter capture | absent | no owned audience | footer capture |
| Agent surfaces (MCP/REST/CLI/llms.txt/OpenAPI) | **all live** | **we are ahead** | keep it that way |
| Commission-neutral ordering | test-enforced | **we are ahead** | say it on the site |

## 5. How to bridge it

The pipeline already exists — `seed-data/*.json` → `npm run seed` (validating upsert *and*
prune) plus `npm run freshness` → `data/review-queue.json`. So the bridge is **a labour
plan, not a build**:

1. **Pick the target number** (my recommendation: **150 offers** — ~4× today, achievable
   with the existing review discipline, and it makes every listing page feel real).
2. **Work in tier order:** business + brokerage first (zero coverage, national, biggest
   bonuses) → nationwide bank/savings set → cards by headline value → Tier C only if the
   target number can't be hit without it.
3. **Use the crowd as a pipe:** the suggest-an-offer and report-an-error features move
   records into the review queue instead of requiring us to find them — build those two
   early, because they multiply the labour we have.
4. **Every added record must carry the same verification as the existing 36** (source_url,
   verification method, last_verified_date, and a stated valuation basis for any points
   bonus). Adding 114 records at lower verification quality would spend the one asset that
   makes this product worth using.

## 7. Decision of record (principal, 2026-10-11)

1. **Catalog target: 494** — match the reference's size. From 36 today that is **458 records to
   add**. (The missing-by-name set is 426 pages / 397 names; the balance to 494 comes from
   institutions they list as several products — Wells Fargo ×4, U.S. Bank ×4, Citi ×2 — and from
   savings/CD variants.)
2. **Business accounts + brokerage: in scope, first** — both are zero coverage today and both are
   national, so they carry the best value per hour of verification.
3. **Tier C, the 328-name community-bank / credit-union long tail: in.** This is the part that
   makes 494 a *programme*, not a batch: most of it is single-state and each record still needs its
   own fetched source.

**Standing constraint attached to all three (principal, same day): do not deviate from our
publishing standards.** The gate is `docs/bridge/RECORD-STANDARD.md` — it binds every future batch
to the claims our own live surfaces already make, including the rolling-monthly re-verification
promise that scales with the catalog (~16–17 records per day at 494).

**Two schema facts that shape the plan (probed on `origin/main`):**

- **Brokerage cannot be added as data.** `BonusType = "bank_account" | "credit_card" | "savings"`,
  and the MCP tool contract, filters, category grouping and tests all key off it. Brokerage needs a
  schema change first (new type + validation + surfaces + tests), then records.
- **Business needs no schema change.** `OfferCategory` in `src/site.ts` derives business by
  matching `/business/i` on `product_name` — deliberately narrow, and explicitly *not* matched on
  `requirements[]` (consumer records mention "business days"). So a business record must carry
  "Business" in its product name, or it will be filed as a consumer account.

## 8. Related finding

The affiliate track is further along than "not started": the live `/disclosure` page carries an
**Impact site-verification meta tag** (`impact-site-verification`) plus a second `fo-verify` tag.
Impact is the network our own `REFRESH_PLAN.md` names first. So the P0 "wire affiliate URLs" step
is an approval-and-data step on a rail that is already verified in production, not a greenfield.

## Decision this file needed — answered 2026-10-11

Target **494**, business + brokerage **in first**, long tail **in**, and the standing constraint
**stay inside our publishing standards**. See §7 above.

## Artifacts

- `docs/bridge/data/ours-inventory.json` — our live 36 records as fetched.
- `docs/bridge/data/theirs-inventory.json` — their 456 names, our 71-name overlap, the 426-offer / 397-name missing set.
- `docs/bridge/data/inventory_gap.py` — re-runnable; re-run before trusting any number above.
