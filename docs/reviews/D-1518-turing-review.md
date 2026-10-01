# Turing review — D-1518 Benefits City (2026-09-30)
Role: turing (isolated subagent, read-only), range 834ed1d..baea192. **Verdict: PASS-WITH-CONDITIONS.** Ran: `npm run test` 35/35, `freshness-cli --canary` PASS, `typecheck` clean. (First attempt died on a rate limit before reporting; it surfaced the /api/stats leak, fixed in b5e84f7+1.)

## Important findings — all fixed test-first (commit 4cabe43, suite 39/39)
- I-1 seed prune could mass-delete: now refuses an empty seed or a prune above max(5, 20%) unless `--allow-mass-prune`.
- I-2 retention purge only at startup: now daily via the flush timer.
- I-3 freshness could stay green forever (claimed 30-day SLA did not exist): `staleFinding` (30 days) added; all-blocked/unreachable run => exit 3.
- I-4 spec acceptance #1 (live check), #4 (registry listing), #6 (receipts): OPEN by design until deploy/publish (Task 10). "Shipped" cannot be claimed yet.

## Minors (deferred, in the ledger)
M-1 amount substring match; M-2 robots.txt handling/logging; M-3/M-9 PUBLIC_URL must be set in prod (Host-derived URLs, cache); M-4 /.well-known/mcp.json only under BASE_PATH (needs proxy rule at origin root); M-5 REST 404 not typed envelope; M-6 compare error label; M-7 compare tie-break; M-8 needs_review served unlabelled.

## Checked clean
No raw affiliate_url leak (feed, item, stats, MCP, CLI, llms.txt, HTML); no open redirect; XSS escaping on new strings; no commission-dependent ordering; DST-safe Eastern date handling; fetch timeouts; no secrets; no vacuous assertions found.
