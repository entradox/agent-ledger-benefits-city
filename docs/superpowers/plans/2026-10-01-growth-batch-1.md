# Benefits City — Growth Batch 1 (D-1533)

> Executed natively, TDD, commit by path. Branch `d-1533-growth-batch1` in worktree `.worktrees/growth` (isolated from other sessions).

**Goal:** make Benefits City findable and citable — human SEO surfaces, AI-citation surfaces, and a visible Sponsored label — without any claim we can't support and without thin/duplicate pages.
**Approved:** principal "Yes go all the way" (2026-10-01) after the growth plan (items 6-9, 4, 12 and the Sponsored label).

## Constraints
- Every page's content is generated from the served data only (no invented prose or stats); numbers carry a source/date.
- No thin or duplicate pages: issuer/state/best pages render only when they have ≥1 offer with distinct content; empty → real 404. State pages exist only for states that have ≥1 REGIONAL offer (otherwise they would duplicate the nationwide list).
- Structured data = `ItemList` + `BreadcrumbList` only (no Offer/Product schema: we don't sell the product; misuse risks a markup penalty).
- Sponsored label is visible text beside any affiliate Apply button; `rel="sponsored"` stays.
- Ordering still ignores commission. Raw `affiliate_url` still never published.
- Outward actions (IndexNow ping, directory submissions, posts, email) are NOT run here: scripts/copy are staged for approval.

## Tasks
1. **Sponsored label** — detail page badge + one-line affiliate notice next to Apply when `isSponsored`; tests both ways.
2. **SEO engine** — `src/seo.ts` (pure: slugs, issuer/state/best/expiring groupings, intro facts) + `src/seo-pages.ts` (HTML + JSON-LD) + routes `/banks`, `/banks/:slug`, `/states`, `/states/:code`, `/best/:type`, `/expiring-soon`; sitemap lists every real page; footer/nav links; tests: unique titles, no zero-offer pages, 404s, JSON-LD parses, sitemap == routes that exist.
3. **Citation surfaces** — `/api/insights` (live original stats with source + date), `/.well-known/ai-plugin-manifest.json` (when_to_cite, citable_facts, not_the_right_citation_for, attribution_format, canonical_data), `/badge.svg` (live count) + embed snippet on /agents; tests incl. honesty of the manifest.
4. **IndexNow** — public key route `/<key>.txt` + `scripts/indexnow-ping.sh` (staged, not run).
5. **Gates, deploy, live verification.**
