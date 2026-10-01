# Reviews — D-1527 Benefits City agent-native parity (2026-10-01)

Both reviewers: isolated read-only subagents. Range 605c207..e42316c (Morgan, copy) and 605c207..HEAD (Turing).

## Morgan — APPROVE-WITH-CONDITIONS (new public copy)
- C1 MEDIUM changelog overstated source for Chase/Wells ("raised", "replaces", "confirmed") — FIXED (now "now listed… reported by four tracking sites; not read on the issuer's own page"). Test pins the wording.
- C2 MEDIUM "ended… no renewal found" unsupported — FIXED (reworded to "reached their stated end date"); evidence recorded in docs/data-ops/2026-09-30-renewal-checks.md.
- C3 MEDIUM Atom links removed offers to a 404 — FIXED.
- C4 LOW feed outlives offers — FIXED (<rights>, dated summaries).
- C5 LOW Truist/Barclays omitted new-customer-only terms — FIXED.
- C6 LOW legal string should name Parmanand LLC — PARTIAL. Wording improved; the entity/DBA sentence is WITHHELD until the principal confirms the AI Agent City DBA filing (Morgan: "confirm… if not filed, flag rather than publish").

## Turing — PASS-WITH-CONDITIONS
- I-1 agent.json endpoints root-relative (resolve outside /benefits) — FIXED: absolute URLs; BASE_PATH test now requests every advertised capability under the mount.
- I-2 duplicated error envelope / limits — FIXED: src/contract.ts (BONUS_TYPES, LIMITS, errorEnvelope) is now used by MCP, REST, OpenAPI, db and seed; a guard test ties every MCP search/expiring parameter NAME to REST and checks the MCP schema bounds against LIMITS. (Initially partial while another session, D-1530, had uncommitted edits in mcp-tools.ts; closed once it landed.)
- M-e (re-graded Important by effect: dead "View offer" links after Oct 6/Oct 14) — FIXED: page and feed link only currently-served offers.
- Deferred minors: M-a REST stricter than MCP (state/query/min/distinct ids); M-b unknown/repeated params ignored (comment reworded); M-c non-matching /api/* paths return HTML 404; M-d restCompare maps any exception to 404; M-f changelog dates shape-only, positional ids, no feed <author>, no fail-fast at boot; M-g server-card drift test compares generator to itself; M-h discovery hits not recorded in metrics; M-i /.well-known files only under /benefits (origin-root proxy rule).

## Verification
Clean worktree of the committed tip deff62f: `npm run test` 67/67, `freshness-cli --canary` PASS.
