# Benefits City — UI spec PROPOSAL

**Author:** Hermes (architect) · **Date:** 2026-10-04 · **Status:** PROPOSAL — needs principal direction + Muse review
**Why Hermes wrote this:** the deep-dive report the rebuild brief cited does not exist on disk
(`deep-dive-2026-10-04/BENEFITS-UI-DEEP-DIVE-2026-10-04.md`; grep for `bankrewards` across
`~/AI-Workbench` = 0 hits). Principal instructed "go" on writing it from the codebase. This is
derived from **source + live probes**, not from taste, and it is not the design.

---

## Step 1 — Design constraints (probed, not assumed)

### Hard constraints

| # | Constraint | Source |
|---|---|---|
| H1 | Server-rendered HTML, no client framework. Site is `src/site.ts` string templates served by `src/web-server.ts`. | code |
| H2 | Every internal link/asset goes through `bp()`; must work under `BASE_PATH=/benefits`. | `src/site.ts` |
| H3 | The agent surface (MCP, `/api/*.json`, `llms.txt`, Atom, sitemap) must keep byte-compatible data. Humans' surface changes; agents' contract does not. | 133-test suite |
| H4 | 133 existing tests must not be weakened. Suite must grow. | baseline run |
| H5 | **Zero image/logo assets exist in the repo today** (`public/assets/` = `site.css`, `llms.txt`). Issuer logos are third-party brand assets and are the single biggest open question in this rebuild. | probe |
| H6 | Performance budget: HTML < 60 KB, CSS < 40 KB, no render-blocking third-party, no CDN dependency. Current: 19 KB HTML / 16 KB CSS. | probe |
| H7 | WCAG AA contrast + keyboard focus visible on every interactive element. | standard |
| H8 | Trust model is the moat and must be **visible on every offer**: `source_url` + `last_verified_date` per offer. Current type carries both. | `src/types.ts` |

### Soft constraints (should satisfy)

- Beat bankrewards on **scanning speed** and **trust legibility**.
- Differentiate on what they cannot copy: they print "we may earn a commission"; this product prints the source URL and the verified date.
- Preserve the existing brand name "Benefits City" (single point: `SITE_NAME`).

### What the competitor actually does (measured)

bankrewards.io, probed 2026-10-04:

| Surface | Measurement |
|---|---|
| Offer card | `grid grid-cols-1 grid-rows-[auto_auto_auto_1fr_auto] gap-3 md:gap-3.5 md:min-h-[328px] h-full` + `bg-card rounded-2xl border border-border p-4 md:p-[18px] transition-colors hover:border-primary/40` |
| Filter control | **chip**, not a submit button: `rounded-full border px-3 py-1.5 text-xs font-semibold` |
| Homepage assets | 58 `<img>`, 37 `<svg>`, **0 `<table>`** |
| /offers | 16 `<img>`, 97 `<svg>`, **0 `<table>`** |
| Fonts | self-hosted `woff2` behind `var(--font-sans)` |
| Footer | "We may earn a commission from some links." |

vs. Benefits City today: **2 `<table class="offers">`, 0 `<img>`, 0 `<svg>`, system font stack.**
The gap is not craft in the abstract — it is that one product renders cards and the other renders a table.

### Solutions considered

**A — Editorial ledger.** Typography-led, high information density. Offer = a dense list row with the bonus as the largest number, issuer name set in the serif/display face, source + verified date in a quiet monospace stamp on every row. No card chrome at all.
- *Fits:* fastest possible scanning, most honest, cheapest to build, ages well.
- *Doesn't:* no place to put a logo, so it sidesteps the logo problem — which the principal's brief explicitly wants solved. Reads as a spreadsheet to a first-time visitor.

**B — Card grid, trust-forward (parity-plus).** Adopt the card grid: one offer per card, issuer logo top-left, bonus as the hero number, requirements as bullets, chip filters, `source` + `verified <date>` pinned to the card footer.
- *Fits:* meets bankrewards on the pattern they have already proven, then beats them on the one thing they cannot copy. Solves the logo brief. Cheapest path to "not slop" because the layout is conventional.
- *Doesn't:* parity means the differentiator has to carry the win; if the trust stamp is done weakly, it is a slightly-worse bankrewards.

**C — Two doors, stated plainly.** The homepage opens by saying the product is a database with two interfaces — one for people, one for agents — and renders a fast, monospace-inflected, near-brutalist surface that is unmistakably not a generic template.
- *Fits:* maximum differentiation; plays to the real moat (agent-native); genuinely memorable.
- *Doesn't:* high risk of reading as unfinished; hardest to make feel trustworthy for a financial product.

**→ Recommended: B, with A's trust-stamp discipline grafted on.** The directive is "match or beat" — parity is the low-risk half, and the differentiated half is the trust data, which is already in the type. C is the direction to take if you would rather be distinct than safe.

---

## Step 2 — References to steal from (not invent)

1. **bankrewards card grid** (measured above) — take the geometry: rounded-2xl, 1px border, ~18px padding, min-height ≈328px so the grid never rags.
2. **Chip filters over submit buttons** — their `rounded-full` chips. The brief bans submit-button filters; this is the replacement pattern, in production in the same category.
3. **Source + verified stamp** — no competitor does this. Borrow the *form* from documentation sites (a quiet mono footnote), not from finance sites.
4. Logo treatment: issuer logos need a neutral container — a fixed 40×40 tile with 8px radius and a hairline border, logo contained, never stretched. This is what stops "generic gradient tiles".

---

## Open questions this proposal does NOT answer

1. **Issuer logos — sourcing and licensing.** H5. Where do issuer logos come from? Options: (a) issuer press/brand pages, self-hosted, (b) a logo API/CDN (violates H6 + adds a dependency), (c) typographic wordmarks drawn from the issuer name (no third-party asset, no licence risk, and it is the *only* option that needs no external source). **Recommendation: (c) for v1**, because it ships today, cannot break, and looks deliberate rather than borrowed. (a) can replace it later per-issuer once provenance is confirmed.
2. **Typeface.** Self-host one variable font, subset to latin + `$`. Candidate: a grotesque with real character at display sizes. This is a taste call and it is yours, not mine.
3. **Which offers are "featured"** on the homepage — rules-based (highest bonus / soonest expiry) or curated? Rules-based is honest and testable; curated invites the pay-to-play smell the disclosure page explicitly disclaims.

## Next step

Principal picks **A / B / C** (recommendation: B). Muse reviews this against the live competitor and says where it is wrong — Muse is the design authority here, not me, and this proposal should be attacked before it becomes seven task cards.

No card for tasks 2–7 exists yet, deliberately. Authoring them against an unapproved direction is how the current slop got built.
