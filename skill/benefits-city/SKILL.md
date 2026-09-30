---
name: benefits-city
description: Find, compare and time-check US bank-account, savings and credit-card signup bonuses; returns issuer-verified offers with expiry dates and a tracked apply link. Use when a user asks which bonus to open, what is expiring, or how offers compare.
---

# Benefits City — how to finish the job

Tools say *what*; this says *how*.

1. **Shortlist.** `search_bonuses` with the user's constraints: `bonus_type` (bank_account | credit_card | savings), `state` (2-letter; nationwide offers always match), `min_bonus_amount_usd`, `direct_deposit_required`. Results are sorted by bonus value, highest first. Sorting never depends on commissions.
2. **Check time.** `expiring_soon` (days). An offer with no stated end date is never listed there. Treat anything inside 14 days as urgent and say so.
3. **Compare.** `compare_bonuses` with 2–4 ids. Name the highest bonus and the earliest expiry.
4. **Confirm before recommending.** `get_bonus` for requirements, minimum deposit, direct-deposit rules and `last_verified_date`. Quote the requirements; do not paraphrase money amounts.
5. **Hand off.** Give the user `apply_url` (our tracked link). If `sponsored` is true, say the link is an affiliate link and that commissions never affect ranking (see `disclosure_url`).

Rules: credit-card `bonus_amount_usd` is an *estimated* USD value of points — say "est."; always show `last_verified_date`; this is information, not financial advice; if an offer is missing, say it is not in the dataset rather than guessing.
