# Record standard — the gate every added offer must pass

Created 2026-10-11 (D-1636) after the principal's constraint: **the 494-record target is not
permission to loosen the standard.** Any agent, lane or cron that adds records to this catalog
reads this file first. A record that cannot pass this gate does not ship — it waits, or it
never enters.

Derived from our own published claims (probed live 2026-10-11) and
`~/AI-Workbench/rules/live-claim-verification.md`.

## 1. The claims our own surfaces already make

Whatever we add must keep these true. They are quoted from the live product, not from the
README, and each one has an operational consequence.

| Claim (surface) | Consequence for every new record |
| --- | --- |
| "**36 verified** bank account and credit card signup bonuses" (`/`, live) | the count is computed from data — it must stay computed, never written into copy |
| "Offers near expiry are re-checked **weekly**; the full feed is re-verified on a **rolling monthly** cadence. Every record shows exactly when it was last confirmed." (`/`, FAQ) | **this is the real cost of the target.** 494 records on a rolling monthly cadence = ~16–17 re-verifications per day, forever. Growing the catalog without growing that sweep makes the published sentence false. |
| "One card per offer, **checked at the source**." (`/`) | each record's own source page is fetched — not a summary of the reference site |
| "each checked against a named source (**issuer page or tracker consensus**)" (`llms.txt`) | the weaker method is permitted in writing, but `verification.method` must say which one was used, per record — `issuer_page` or `aggregator_consensus` with ≥3 named sources |
| "Every record carries `source_url` and `last_verified_date`. Card point values are **estimated USD**." (`llms.txt`) | no record ships without both fields; a points bonus carries a stated valuation basis in `requirements` |
| "Total bonus value available: $36,522. Last verification sweep: 2026-10-06." (`llms.txt`) | both numbers are derived. A sweep date that no sweep produced is a lie with a timestamp on it. |
| "Default order is by bonus value … **commission is never an input**" (`/disclosure`) | `src/tests/links.test.ts` (ordering, `sponsored`) must stay green after every batch. Never sort, tag or boost a record by its affiliate status. |
| "When affiliate partnerships go live, affected links will carry …" (`/disclosure`) | `affiliate_url` is **input only** — never published in MCP/REST/CLI/feeds. Only `/go/:id` may consume it. |

## 2. Per-record requirements (all mandatory)

1. **Own words.** Terms are written from the provider's own published page. The reference site's
   copy is never pasted, paraphrased-with-its-phrasing, or used as the source of a number. It is
   a **discovery tripwire** — it tells us an offer exists; it never tells us what the terms are.
2. **A named source that was actually fetched** (`source_url`, `verification.sources[]`), with
   `verification.method` set honestly and `verification.verified_at` = the date of the fetch.
3. **`last_verified_date`** = the same date. No carry-forward: a record touched today with terms
   read last month is not verified today.
4. **Requirements in plain English**, as the applicant performs them, including the deadline the
   provider states ("$2,000 in eligible direct deposits within 90 days").
5. **States**: `"nationwide"` or the exact state list from the provider's terms. A state list is
   never inferred from the offer's name or from the reference site's summary.
6. **Expiry**: the provider's stated date, or `null` when the provider states none. **Never
   invent an end date** and never carry the reference site's date.
7. **Points/miles**: `bonus_points` plus a `bonus_amount_usd` derived from a **published
   third-party valuation** (the disclosure page's own wording), with the basis stated in
   `requirements`. A made-up cents-per-point is a fabricated claim.
8. **`status`**: `active` only after step 2. Otherwise `needs_review` — and `needs_review`
   records are not counted in published totals.
9. **Eligibility** facts (new-to-bank, once-per-lifetime, cooldown) only when the provider states
   them; `null` means unknown, and unknown is allowed.
10. **No aggregate in a record's prose.** "The biggest bonus available" is a claim about the whole
    catalog at that moment and is computed on the page, not asserted in data
    (`live-claim-verification.md` §5/§6 — no unsupportable universals).

## 3. Mechanical checks before a batch lands

```bash
npm run build && npm run test        # schema validator, schema canary, links/ordering, sponsored,
                                     # REST/MCP parity, SEO, rate-limit suites must all stay green
npm run seed                         # validates AND prunes: seed-data/*.json is the source of truth
```

Then, per batch, one human/agent read of the diff against this file. A green suite proves the code
does what the code says; it says nothing about whether a term was copied correctly
(`live-claim-verification.md`, anti-pattern: "treating a green test suite as claim verification").

## 4. Process truth — fix the claim or fix the process

Two claims do not survive an automated or bulk-verified catalog as written:

- The **local README** says the base set was "verified live … by hand" and "nothing was invented".
  Once bulk work starts, either every added record still passes a named reviewer, or that sentence
  is corrected to describe the real pipeline (fetch → extract → review queue → approve). It is a
  record, not a promise: correct it in the same commit as the first bulk batch.
- The **sweep date** in `llms.txt` must be produced by the sweep. If bulk adds land, run the sweep
  and let the date move on its own.

## 5. What "the reference site is a tripwire" means in practice

Allowed: reading their **listing/sitemap** to learn *that* an offer exists (this is how the
missing set was built — 426 of their pages, 397 distinct names), and comparing coverage counts.
Not allowed: taking their requirements text, their state list, their expiry date, their bonus
value, their point valuation, or their fine print as the content of our record. Their dollar
figures quoted in `inventory-gap.md` are **benchmark data for planning**, explicitly not verified
terms — see the note in that file.

## 6. Blocking rules

- A batch that cannot cite a fetched source per record **does not merge**.
- A batch that lowers `verification.method` distribution toward `aggregator_consensus` without
  saying so in the PR body **does not merge**.
- A record whose `affiliate_url` presence changed an ordering or a published field **does not
  merge** — that is the one claim this product is built on.
