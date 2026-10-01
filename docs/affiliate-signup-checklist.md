# Benefits City — Affiliate Signup Checklist (step 0)

**Owner:** Abhishek (signups, credentials, tax/entity are his). **Status:** not started as of 2026-09-30.
**Do this after** the D-1518 branch is deployed: network reviewers look at the live site, and the site now has an honest disclosure page, an About page, issuer-sourced data and a freshness process.

> Nothing below states a payout, approval rule or program availability. Each is a thing to **verify on the network's own pages** before relying on it.

## 1. What to apply to (check which of these actually carry the offers you list)
Bank and card affiliate programs are usually run through a network, or directly by an issuer. For each issuer already on the site (Chase, Wells Fargo, Citi, Amex, Capital One, TD, Truist, M&T, Barclays, SoFi, PNC, US Bank, KeyBank, Associated, Huntington, Fifth Third, BofA, BMO, Discover):
- [ ] Search the major networks (Impact, Awin, CJ, Rakuten, plus any card-specific network) for the issuer's program.
- [ ] Note whether it is **open**, **invite-only**, or **not offered** — then ask the program manager, don't assume.
- [ ] Record what it pays and on what event (account opened vs. funded vs. approved card) — in a private note, not on the public site.

## 2. What to have ready (typical reviewer asks — verify per program)
- [ ] Live site URL: `aiagentscity.com/benefits` (deployed, not localhost).
- [ ] Disclosure page: `/disclosure` (names partners once approved), `/about`, `/contact` working.
- [ ] A business entity and tax details (Parmanand LLC — confirm with your CPA agent which entity/EIN and 1099 handling).
- [ ] A description of traffic sources: SEO content, newsletter (planned), AI agents via MCP. Be honest that traffic is new.

## 3. Before ANY affiliate link goes live (Morgan, D-1518 review — required)
- [ ] Visible **"Sponsored"** text label next to every affiliate Apply button (site) and `sponsored: true` (MCP/JSON) — `rel="sponsored"` alone is invisible to people (FTC Endorsement Guides, 16 CFR 255).
- [ ] `/disclosure` lists every partner network/program **by name**.
- [ ] Read each program agreement for: brand/trademark use; keyword-bidding bans; approved-creative-only rules; required "Rates & Fees"/terms links per card; passed-down advertising language; rules on showing non-partner competitors beside partner offers.
- [ ] Re-verify the offer **at the moment its link goes live** so the amount on the page matches the partner page (a stale higher bonus on an affiliate link is a deception risk).
- [ ] Confirm "at no extra cost to you" is accurate for each program.
- [ ] The ordering regression test (`src/tests/links.test.ts`) is green: ordering must stay independent of commission.
- [ ] Inclusion stays independent of commission: don't add or drop an offer because a program exists. Log the reason for each inclusion.
- [ ] Track affiliate income as its own revenue line; update the privacy page if a network sets cookies via `/go/`.

## 4. Technical hook (already built)
Put the partner-tracked URL in the record's `affiliate_url` (seed-data). `/go/:id` redirects to it, `sponsored` flips to true everywhere, and the disclosure text switches automatically. The raw partner URL is never published in feeds/MCP/CLI. No code change needed — but the visible "Sponsored" label (section 3) is a required follow-up code change before the first live link.

*Not legal advice. Have counsel read the program agreements.*
