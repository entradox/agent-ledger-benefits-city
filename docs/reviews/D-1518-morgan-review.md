# Morgan review — D-1518 Benefits City (2026-09-30)
Role: morgan (isolated subagent, read-only). **Verdict: APPROVE-WITH-CONDITIONS.** Not legal advice; human counsel for binding decisions.

## Conditions (all pre-deploy conditions applied — see commits d11f5dc..baea192)
1. HIGH — "issuer-verified" false (23 of 32 records had no verification block): reworded to "checked against a named source". APPLIED.
2. HIGH — /about "a human confirms every offer" unsupported: reworded. APPLIED.
3. HIGH — "Apply links go to official pages" false (BMO→Doctor of Credit, Capital One→article): reworded to issuer page or named tracker. APPLIED.
4. MEDIUM — contradictory ordering claims: one sentence everywhere; regression test `ranking is independent of commission` exists (links.test.ts). APPLIED.
5. MEDIUM — analytics claim overstated: old salts deleted, search text stored as q=1, 90-day retention + disclosure sentence; retention enforced daily (Turing I-2). APPLIED.
6. MEDIUM — Citi record labelled issuer_page but card name differed; valuation unfetched: product_name set to issuer page name; TPG page fetched ($1,813 = 125k x 1.45c). APPLIED.
7. MEDIUM — "total bonus value available" relabelled "combined headline value of listed offers". APPLIED.
8. LOW — tax FAQ added. APPLIED.
9. LOW — valuation labelling acceptable; re-date July valuations on next sweep. OPEN (next data sweep).

## Must be true BEFORE any affiliate link goes live (not before this deploy)
Visible "Sponsored" label; partners named on /disclosure; program-agreement review (trademarks, keyword bidding, approved creative, per-card terms, Reg Z/CARD Act language, competitor placement); re-verify the offer when its link goes live; confirm "no extra cost"; ordering test green; inclusion independent of commission; separate affiliate revenue tracking + privacy page if cookies via /go/. Captured in docs/affiliate-signup-checklist.md.
