# Reviews — D-1533 Benefits City growth batch 1 (2026-10-01)

Isolated read-only reviewers. Range main(9e633b7)..branch.

## Morgan — APPROVE-WITH-CONDITIONS (all applied)
- C1 HIGH "verified/checked by hand" claims false for tracker-consensus offers — FIXED everywhere (footer, landing H1/stat, FAQ, browse, llms.txt); the landing H1 "Every US bank bonus" also removed (coverage is partial). Test scans landing/about/agents/browse/llms for "by hand" and "Every US bank bonus".
- C2 "Best … right now" — FIXED: "Highest … bonuses right now", ranking basis + "not a recommendation" stated, affiliate disclosure on the ranking page itself. (URL slug /best/ kept.)
- C3 insights/manifest overreach — FIXED: scope statement; card figures named `*_estimated_value_usd`; manifest warns about points estimates and market-wide totals.
- C4 badge "checked DATE" — FIXED: "updated DATE"; alt text "tracked"; no-endorsement line under the embed snippet.
- C5 Sponsored label — FIXED: notice + badge now precede the Apply button; faded opacity removed (test).
- C6 issuer meta description lost "estimated value" — FIXED (test).
- Go-live trigger (carry): when the first affiliate link activates, re-check C2/C4/C5 and per-partner "no extra cost" terms parity.

## Turing — PASS-WITH-CONDITIONS (required items fixed)
- I1 issuer slug collision merged two issuers — FIXED (distinct slugs, correct names; negative test).
- I2 `as_of` overstated freshness — FIXED: computed_at + oldest_check/newest_check; badge says "updated".
- I3 per-render recomputation — FIXED cheaply: date formatter built once, `today` computed once per query. (Memoizing seoPaths per request deferred until offers > ~150.)
- I4 dry-run network/uncaught error — FIXED: documented read-only GET; clean exit 3 on unreachable site (test).
- M1 duplicate state codes — FIXED. M4 shared byValue/checkRange/isExpiringWithin — FIXED. M5 insights base URL from request — FIXED. M6 vacuous test — removed.
- Deferred minors: M2 non-ASCII issuer slugs; M3 /banks/CHASE vs /states/CA case handling (canonical is lowercase); M7 badge width estimate.

## Data additions (issuer-page verified, 2026-10-01)
Capital One Savor + Quicksilver ($200 / $500 in 3 months), Chase Freedom Unlimited ($200 / $500 in 3 months — Chase's own page; resolves the earlier held "$250" claim: it was wrong), Chase Ink Business Preferred (100,000 pts / $8,000), Bank of America Customized Cash ($200 / $1,000 in 90 days).
HELD (unverified, deliberately not added): Wells Fargo Active Cash (issuer page says $100, trackers say $200); Capital One 360 savings tiers (contradictory promo codes and look-back dates); Citi Double Cash (issuer page shows no figures); Chase Business Complete (issuer-verified terms but state availability unconfirmed); savings offers whose issuer URLs could not be fetched (Live Oak, E*TRADE, Chase Savings).
