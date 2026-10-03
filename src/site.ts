/**
 * Benefits City — server-rendered hybrid site (humans + agents).
 *
 * All internal links, asset paths, and form actions go through `bp()` so the
 * whole site works under a BASE_PATH (e.g. "/bonuses" behind aiagentscity.com).
 * Data is rendered live from the real bonus database — nothing is hardcoded.
 */
import { expiringSoon, getBonusById, listAll, searchBonuses } from "./db.js";
import type { ChangelogEntry } from "./changelog.js";
import { isUsStateCode } from "./contract.js";
import { seoPaths } from "./seo.js";
import { affiliateActive, disclosureShort, isSponsored, resolveApplyUrl } from "./links.js";
import { daysUntil, formatBonus, formatDate, formatUsd, getStats } from "./stats.js";
import type { Bonus } from "./types.js";

/** Product display name — rename here and it follows everywhere the site renders. */
export const SITE_NAME = "Benefits City";

export interface SiteContext {
  /** "" or "/bonuses" — mount point of this app */
  basePath: string;
  /** Public origin+base, e.g. "https://aiagentscity.com/benefits" — for endpoint docs */
  publicUrl: string;
}

export function bp(ctx: SiteContext, p: string): string {
  return `${ctx.basePath}${p}`;
}

export function esc(s: string | number | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** JSON-LD must not be able to close its own <script>; escape every "<". */
export function ldScript(obj: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
}

function typeBadge(b: Bonus): string {
  if (b.bonus_type === "bank_account") return `<span class="badge badge-type-bank">Bank account</span>`;
  if (b.bonus_type === "savings") return `<span class="badge badge-type-bank">Savings</span>`;
  return `<span class="badge badge-type-card">Credit card</span>`;
}

export function expiryBadge(b: Bonus): string {
  const d = daysUntil(b.expiry_date);
  if (d == null) return `<span class="badge">No stated end</span>`;
  if (d < 0) return `<span class="badge badge-soon">Expired</span>`;
  if (d === 0) return `<span class="badge badge-soon">Ends today</span>`;
  if (d <= 30) return `<span class="badge badge-soon">${d} day${d === 1 ? "" : "s"} left</span>`;
  return `<span class="badge">${formatDate(b.expiry_date)}</span>`;
}

function statesLabel(b: Bonus): string {
  if (b.states_available === "nationwide") return "Nationwide";
  if (Array.isArray(b.states_available)) {
    if (b.states_available.length > 6)
      return `${b.states_available.length} states`;
    return b.states_available.join(", ");
  }
  return "Nationwide";
}

function amountHtml(b: Bonus, big = false): string {
  const cls = big ? "amount" : "amount";
  const note =
    b.bonus_type === "credit_card" ? ` <small>est. value</small>` : ` <small>bonus</small>`;
  return `<div class="${cls}">${formatBonus(b.bonus_amount_usd)}${note}</div>`;
}

export function bonusCard(ctx: SiteContext, b: Bonus): string {
  const detail = bp(ctx, `/bonuses/${esc(b.id)}`);
  return `<article class="card">
    <div class="bank">${esc(b.bank_or_issuer)}</div>
    <h3><a href="${detail}">${esc(b.product_name)}</a></h3>
    ${amountHtml(b)}
    <div class="meta">${typeBadge(b)} ${expiryBadge(b)}</div>
    <div class="meta"><span>${esc(statesLabel(b))}</span>${b.direct_deposit_required ? "<span>Direct deposit required</span>" : "<span>No direct deposit needed</span>"}</div>
    <div class="actions"><a href="${detail}">Full details →</a></div>
  </article>`;
}

/* ---------------- shell ---------------- */

function nav(ctx: SiteContext): string {
  return `<header class="nav"><div class="wrap nav-inner">
    <a class="brand" href="${bp(ctx, "/")}"><span class="brand-mark">B</span><span>${SITE_NAME}<small>an AI Agent City project</small></span></a>
    <nav class="nav-links">
      <a href="${bp(ctx, "/bonuses")}">Browse bonuses</a>
      <a href="${bp(ctx, "/agents")}">For agents</a>
      <a href="${bp(ctx, "/about")}">About</a>
    </nav>
    <a class="btn nav-cta" href="${bp(ctx, "/bonuses")}">Find a bonus</a>
  </div></header>`;
}

/** Footer links to the SEO pages — only the ones that currently exist (no links to empty pages). */
function seoFooterLinks(ctx: SiteContext): string {
  const paths = new Set(seoPaths());
  const links: [string, string][] = [
    ["/banks", "Bonuses by bank"],
    ["/best/bank-account", "Best bank account bonuses"],
    ["/best/credit-card", "Best credit card bonuses"],
    ["/best/savings", "Best savings bonuses"],
    ["/states", "Bonuses by state"],
    ["/expiring-soon", "Expiring soon"],
  ];
  return links.filter(([p]) => paths.has(p)).map(([p, t]) => `<li><a href="${bp(ctx, p)}">${t}</a></li>`).join("\n        ");
}

function footer(ctx: SiteContext): string {
  return `<footer class="footer"><div class="wrap">
    <div class="footer-grid">
      <div class="blurb">
        <a class="brand" href="${bp(ctx, "/")}"><span class="brand-mark">B</span><span>${SITE_NAME}</span></a>
        <p>US bank account, savings and credit card signup bonuses — each checked against a named source, structured for humans and AI agents alike. An AI Agent City project.</p>
      </div>
      <div><h4>Explore</h4><ul>
        <li><a href="${bp(ctx, "/bonuses")}">Browse bonuses</a></li>
        <li><a href="${bp(ctx, "/bonuses?type=bank_account")}">Bank account bonuses</a></li>
        <li><a href="${bp(ctx, "/bonuses?type=credit_card")}">Credit card bonuses</a></li>
        <li><a href="${bp(ctx, "/agents")}">For agents</a></li>
        ${seoFooterLinks(ctx)}
      </ul></div>
      <div><h4>Machine access</h4><ul>
        <li><a href="${bp(ctx, "/api/bonuses.json")}">JSON feed</a></li>
        <li><a href="${bp(ctx, "/api/stats")}">Stats API</a></li>
        <li><a href="${bp(ctx, "/llms.txt")}">llms.txt</a></li>
        <li><a href="${bp(ctx, "/api")}">API descriptor</a></li>
      </ul></div>
      <div><h4>Trust</h4><ul>
        <li><a href="${bp(ctx, "/about")}">About</a></li>
        <li><a href="${bp(ctx, "/disclosure")}">Affiliate disclosure</a></li>
        <li><a href="${bp(ctx, "/privacy")}">Privacy</a></li>
        <li><a href="${bp(ctx, "/terms")}">Terms</a></li>
        <li><a href="${bp(ctx, "/contact")}">Contact</a></li>
      </ul></div>
    </div>
    <div class="footer-bottom">
      <span>© 2026 AI Agent City</span>
      <span>every offer carries its source and check date</span>
    </div>
  </div></footer>`;
}

export function shell(ctx: SiteContext, title: string, desc: string, body: string, path = "/", extraHead = ""): string {
  // Canonical + og:url are derived from ctx.publicUrl (the PUBLIC_URL env), never from the
  // request Host header. That matters because this app is reachable on two hosts — the
  // Railway origin and aiagentscity.com/benefits through the reverse proxy — and they serve
  // identical content. Self-referencing from the request host would let the origin declare
  // ITSELF canonical, which is the duplicate-content problem rather than the fix.
  // ctx.publicUrl already carries the /benefits base, so no bp() here.
  const canonical = `${ctx.publicUrl.replace(/\/+$/, "")}${path === "/" ? "/" : path}`;
  // Operator-pasted site-verification tags (affiliate networks, directories) — injected
  // verbatim so a new verification is a Railway env set, not a deploy. Trusted input only.
  const verificationTags = (process.env.SITE_VERIFICATION_TAGS ?? "").trim();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — ${SITE_NAME}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<link rel="stylesheet" href="${bp(ctx, "/assets/site.css")}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='22' fill='%234F46E5'/><text x='50' y='68' font-size='52' text-anchor='middle' fill='white' font-family='monospace' font-weight='bold'>B</text></svg>">
${extraHead}
${verificationTags}
</head>
<body>
${nav(ctx)}
<main>${body}</main>
${footer(ctx)}
</body>
</html>`;
}

/* ---------------- landing ---------------- */

export function landingPage(ctx: SiteContext): string {
  const stats = getStats();
  const expiring = expiringSoon(30).slice(0, 5);
  const topBank = searchBonuses({ bonus_type: "bank_account", limit: 4 });
  const topCards = searchBonuses({ bonus_type: "credit_card", limit: 4 });

  const rows = (list: Bonus[]) =>
    list
      .map(
        (b) => `<tr>
          <td><a href="${bp(ctx, `/bonuses/${esc(b.id)}`)}"><strong>${esc(b.bank_or_issuer)}</strong> ${esc(b.product_name)}</a></td>
          <td class="amt">${formatBonus(b.bonus_amount_usd)}${b.bonus_type === "credit_card" ? " <span class='badge'>est.</span>" : ""}</td>
          <td>${expiryBadge(b)}</td>
        </tr>`,
      )
      .join("");

  const expiringCards = expiring.map((b) => bonusCard(ctx, b)).join("");

  const body = `
  <section class="hero"><div class="wrap">
    <div class="eyebrow">AI Agent City · Benefits</div>
    <h1>US signup bonuses. <span class="hl">Checked at the source.</span></h1>
    <p class="lede">${stats.total_offers} verified bank account and credit card signup bonuses — browsable by humans, queryable by AI agents over MCP. Every offer carries its source and last-verified date. No invented deals, ever.</p>
    <div class="hero-ctas">
      <a class="btn" href="${bp(ctx, "/bonuses")}">Browse bonuses</a>
      <a class="btn btn-dark-outline" href="${bp(ctx, "/agents")}">Connect an agent →</a>
    </div>
    <div class="stat-row">
      <div class="stat"><div class="v">${stats.total_offers}</div><div class="k">live offers tracked</div><div class="n">${stats.bank_account_offers} bank · ${stats.credit_card_offers} cards</div></div>
      <div class="stat"><div class="v mint">${formatUsd(stats.total_bonus_usd)}</div><div class="k">combined headline value of listed offers</div><div class="n">card points at est. USD value</div></div>
      <div class="stat"><div class="v">${stats.expiring_within_30d.length}</div><div class="k">expiring within 30 days</div><div class="n">act before the deadline</div></div>
      <div class="stat"><div class="v">${esc(stats.last_verified ?? "—")}</div><div class="k">last verification sweep</div><div class="n">most recent source check</div></div>
    </div>
  </div></section>

  <section class="section"><div class="wrap">
    <h2>Built for humans. Native for agents.</h2>
    <p class="sub">One database, two first-class interfaces. Browse it yourself, or let your AI agent do the hunting.</p>
    <div class="split">
      <div class="panel">
        <h3><span class="tag tag-human">For humans</span> The fine print, decoded</h3>
        <ul>
          <li>Filter by state, bonus size, and direct-deposit requirements</li>
          <li>Every requirement listed in plain English — no PDF-hunting</li>
          <li>Days-remaining countdown on every expiring offer</li>
          <li>Sort by bonus value or by deadline</li>
        </ul>
        <p><a href="${bp(ctx, "/bonuses")}">Start browsing →</a></p>
      </div>
      <div class="panel">
        <h3><span class="tag tag-agent">For agents</span> Query it like a database</h3>
        <ul>
          <li>MCP server: <code>search_bonuses</code>, <code>get_bonus</code>, <code>expiring_soon</code>, <code>compare_bonuses</code></li>
          <li>Streamable HTTP at <code>${esc(ctx.publicUrl)}/mcp</code> — no API key</li>
          <li>JSON feeds + <code>llms.txt</code> for any crawler or agent</li>
          <li>Structured schema: requirements[], states[], expiry dates</li>
        </ul>
        <p><a href="${bp(ctx, "/agents")}">Agent docs →</a></p>
      </div>
    </div>
  </div></section>

  <section class="section-tight"><div class="wrap">
    <h2>Top bank account bonuses</h2>
    <p class="sub">Highest cash bonuses on new checking and savings accounts, right now.</p>
    <div class="tbl-wrap"><table class="offers">
      <thead><tr><th>Offer</th><th>Bonus</th><th>Expiry</th></tr></thead>
      <tbody>${rows(topBank)}</tbody>
    </table></div>
    <p style="margin-top:14px"><a href="${bp(ctx, "/bonuses?type=bank_account")}">All ${stats.bank_account_offers} bank bonuses →</a></p>
  </div></section>

  <section class="section-tight"><div class="wrap">
    <h2>Top credit card signup bonuses</h2>
    <p class="sub">Point values converted to estimated USD so cards compare apples-to-apples with cash.</p>
    <div class="tbl-wrap"><table class="offers">
      <thead><tr><th>Offer</th><th>Est. value</th><th>Expiry</th></tr></thead>
      <tbody>${rows(topCards)}</tbody>
    </table></div>
    <p style="margin-top:14px"><a href="${bp(ctx, "/bonuses?type=credit_card")}">All ${stats.credit_card_offers} card bonuses →</a></p>
  </div></section>

  ${expiring.length ? `<section class="section-tight"><div class="wrap">
    <h2>Expiring soon</h2>
    <p class="sub">These deadlines are real — confirm terms before you apply.</p>
    <div class="cards">${expiringCards}</div>
  </div></section>` : ""}

  <section class="section"><div class="wrap">
    <h2>How it works</h2>
    <p class="sub">A bonus feed is only as good as its verification. Here's the pipeline.</p>
    <div class="steps">
      <div class="step"><div class="num">01</div><h3>We track</h3><p>Bank promo pages and reputable bonus trackers are monitored for new and changed offers — checking, savings, and credit cards.</p></div>
      <div class="step"><div class="num">02</div><h3>We verify</h3><p>Each offer's terms are checked against the issuer's own page where we can read it, otherwise against bonus trackers that agree. Every record is stamped with its source URL and verification date.</p></div>
      <div class="step"><div class="num">03</div><h3>You act</h3><p>Browse here, or have your agent query the MCP feed — then apply directly with the bank. Nothing to sign up for, no paywall.</p></div>
    </div>
  </div></section>

  <section class="section-tight"><div class="wrap">
    <h2>Questions, answered honestly</h2>
    <div style="max-width:760px;margin-top:20px">
      <details class="faq"><summary>Is this free?</summary><p>Yes. No signup, no paywall, no account. Agents query the MCP server and JSON feeds free too — no API key.</p></details>
      <details class="faq"><summary>Where does the data come from?</summary><p>Every offer is checked against a named source — the issuer's own page where we can read it, otherwise a bonus tracker where several agree. Each record carries a <span class="mono">source_url</span>, a <span class="mono">verification</span> method and a <span class="mono">last_verified_date</span>. Offers we can't verify don't get listed.</p></details>
      <details class="faq"><summary>Are the Apply links affiliate links?</summary><p>${esc(disclosureShort(affiliateActive(listAll())))} See the <a href="${bp(ctx, "/disclosure")}">full disclosure</a>.</p></details>
      <details class="faq"><summary>Are bonuses taxable?</summary><p>Bank bonuses are generally reported as interest income (Form 1099-INT); card rewards are generally treated differently. Check with a tax professional.</p></details>
      <details class="faq"><summary>How do credit card point values work?</summary><p>Points and miles are converted to USD using published per-point valuations so cards compare fairly with cash bonuses. The valuation basis is stated in each offer's requirements. Cash is cash; points are estimates.</p></details>
      <details class="faq"><summary>How often is the data re-verified?</summary><p>Offers near expiry are re-checked weekly; the full feed is re-verified on a rolling monthly cadence. Every record shows exactly when it was last confirmed.</p></details>
      <details class="faq"><summary>I'm an AI agent. How do I use this?</summary><p>Connect to the MCP server over Streamable HTTP, pull the JSON feeds, or read <a href="${bp(ctx, "/llms.txt")}">llms.txt</a>. Full copy-paste instructions are on the <a href="${bp(ctx, "/agents")}">For agents</a> page.</p></details>
    </div>
    <div class="disclosure-box">
      <h3>Affiliate disclosure</h3>
      <p>${SITE_NAME} is reader-supported. ${esc(disclosureShort(affiliateActive(listAll())))} <a href="${bp(ctx, "/disclosure")}">Read the full disclosure →</a></p>
    </div>
  </div></section>`;

  // Plain-text mirrors of the visible FAQ <details> blocks above — schema must not
  // claim questions the page does not visibly ask.
  const faqs: [string, string][] = [
    ["Is this free?", "Yes. No signup, no paywall, no account. Agents query the MCP server and JSON feeds free too — no API key."],
    ["Where does the data come from?", "Every offer is checked against a named source — the issuer's own page where we can read it, otherwise a bonus tracker where several agree. Each record carries a source_url, a verification method and a last_verified_date. Offers we can't verify don't get listed."],
    ["Are the Apply links affiliate links?", `${disclosureShort(affiliateActive(listAll()))} See ${ctx.publicUrl}/disclosure.`],
    ["Are bonuses taxable?", "Bank bonuses are generally reported as interest income (Form 1099-INT); card rewards are generally treated differently. Check with a tax professional."],
    ["How do credit card point values work?", "Points and miles are converted to USD using published per-point valuations so cards compare fairly with cash bonuses. The valuation basis is stated in each offer's requirements. Cash is cash; points are estimates."],
    ["How often is the data re-verified?", "Offers near expiry are re-checked weekly; the full feed is re-verified on a rolling monthly cadence. Every record shows exactly when it was last confirmed."],
    ["I'm an AI agent. How do I use this?", `Connect to the MCP server over Streamable HTTP, pull the JSON feeds, or read ${ctx.publicUrl}/llms.txt. Full instructions are on the For agents page at ${ctx.publicUrl}/agents.`],
  ];
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: `${ctx.publicUrl.replace(/\/+$/, "")}/`,
      description: "Verified US bank account and credit card signup bonuses — browsable by humans, queryable by AI agents over MCP.",
      publisher: { "@type": "Organization", name: "AI Agent City", url: new URL(ctx.publicUrl).origin },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "AI Agent City",
      url: new URL(ctx.publicUrl).origin,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map(([q, a]) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ];

  return shell(ctx, "US Bank & Credit Card Signup Bonuses, Verified", "Every verified US bank account opening bonus and credit card signup bonus — browsable by humans, queryable by AI agents over MCP.", body, "/", schema.map(ldScript).join(""));
}

/* ---------------- browse ---------------- */

export interface BrowseQuery {
  type: string; // "" | "bank_account" | "credit_card" | "savings"
  state: string;
  min: string;
  dd: string; // "" | "yes" | "no"
  q: string;
  sort: string; // "value" | "expiry"
}

export function browsePage(ctx: SiteContext, query: BrowseQuery): string {
  const filters: Parameters<typeof searchBonuses>[0] = {};
  if (query.type === "bank_account" || query.type === "credit_card" || query.type === "savings")
    filters.bonus_type = query.type;
  const minNum = Number(query.min);
  if (query.min !== "" && Number.isFinite(minNum) && minNum > 0)
    filters.min_bonus_amount_usd = minNum;
  if (query.dd === "yes") filters.direct_deposit_required = true;
  if (query.dd === "no") filters.direct_deposit_required = false;
  if (isUsStateCode(query.state.trim())) filters.state = query.state.trim().toUpperCase();
  if (query.q.trim()) filters.query = query.q.trim();
  filters.limit = 100;

  let results = searchBonuses(filters);
  if (query.sort === "expiry") {
    results = results.slice().sort((a, b) => {
      if (!a.expiry_date && !b.expiry_date) return b.bonus_amount_usd - a.bonus_amount_usd;
      if (!a.expiry_date) return 1;
      if (!b.expiry_date) return -1;
      return a.expiry_date.localeCompare(b.expiry_date);
    });
  }

  const sel = (name: string, value: string, current: string) =>
    value === current ? " selected" : "";
  const cards = results.map((b) => bonusCard(ctx, b)).join("");

  const body = `
  <div class="wrap">
    <div class="page-head">
      <h1>Browse bonuses</h1>
      <p>${results.length} offer${results.length === 1 ? "" : "s"} · every one with its source on record.</p>
    </div>
    <div class="filters">
      <form method="get" action="${bp(ctx, "/bonuses")}">
        <div class="field"><label for="f-type">Type</label>
          <select id="f-type" name="type">
            <option value=""${sel("type", "", query.type)}>All</option>
            <option value="bank_account"${sel("type", "bank_account", query.type)}>Bank accounts</option>
            <option value="credit_card"${sel("type", "credit_card", query.type)}>Credit cards</option>
            <option value="savings"${sel("type", "savings", query.type)}>Savings accounts</option>
          </select></div>
        <div class="field"><label for="f-state">State</label>
          <input id="f-state" name="state" value="${esc(query.state)}" placeholder="e.g. TX" maxlength="2" size="4" style="text-transform:uppercase"></div>
        <div class="field"><label for="f-min">Min. bonus ($)</label>
          <input id="f-min" name="min" type="number" min="0" step="50" value="${esc(query.min)}" placeholder="0" style="width:110px"></div>
        <div class="field"><label for="f-dd">Direct deposit</label>
          <select id="f-dd" name="dd">
            <option value=""${sel("dd", "", query.dd)}>Any</option>
            <option value="yes"${sel("dd", "yes", query.dd)}>Required</option>
            <option value="no"${sel("dd", "no", query.dd)}>Not required</option>
          </select></div>
        <div class="field"><label for="f-q">Search</label>
          <input id="f-q" name="q" value="${esc(query.q)}" placeholder="Chase, Sapphire…" style="width:170px"></div>
        <div class="field"><label for="f-sort">Sort by</label>
          <select id="f-sort" name="sort">
            <option value="value"${sel("sort", "value", query.sort)}>Highest bonus</option>
            <option value="expiry"${sel("sort", "expiry", query.sort)}>Expiring first</option>
          </select></div>
        <div class="field"><button class="btn" type="submit">Apply</button></div>
      </form>
    </div>
    <p class="result-count">${results.length} result${results.length === 1 ? "" : "s"}</p>
    ${results.length ? `<div class="cards">${cards}</div>` : `<div class="empty"><p><strong>No bonuses match those filters.</strong></p><p>Try widening the state or lowering the minimum bonus.</p></div>`}
    <div style="height:40px"></div>
  </div>`;

  // ItemList mirrors the rendered results exactly (results is already capped at 100).
  // ItemList only — we list these offers, we don't sell them, so no Product/Offer markup.
  const itemList = ldScript({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Verified US signup bonuses",
    numberOfItems: results.length,
    itemListElement: results.map((b, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${ctx.publicUrl.replace(/\/+$/, "")}/bonuses/${b.id}`,
      name: `${b.bank_or_issuer} ${b.product_name}`,
    })),
  });
  return shell(ctx, "Browse Bonuses", "Search and filter every verified US bank account and credit card signup bonus.", body, "/bonuses", itemList);
}

/* ---------------- detail ---------------- */

export function detailPage(ctx: SiteContext, id: string): string | null {
  const b = getBonusById(id);
  if (!b) return null;
  const d = daysUntil(b.expiry_date);
  const expiryLine =
    d == null ? "No stated end date"
    : d < 0 ? `Expired ${formatDate(b.expiry_date)}`
    : d === 0 ? "Ends today"
    : `Ends ${formatDate(b.expiry_date)} — ${d} day${d === 1 ? "" : "s"} left`;

  const reqs = b.requirements.map((r) => `<li>${esc(r)}</li>`).join("");

  // Apply clicks route through /go/:id, which 302s to the issuer's offer page (or the
  // partner link when one is set). That makes the click countable and gives affiliate
  // tagging a single injection point. Sponsored links carry rel="sponsored".
  const applyUrl = resolveApplyUrl(b);
  // A VISIBLE "Sponsored" label sits beside every affiliate Apply button (FTC: clear and
  // conspicuous, close to the link) — rel="sponsored" alone is invisible to people.
  const sponsoredNote = isSponsored(b)
    ? `<div class="sponsored-note"><span class="badge badge-sponsored">Sponsored</span> This is an affiliate link: we may earn a commission if you open an account through it, at no extra cost to you. It never affects which offers we list or how we order them. <a href="${bp(ctx, "/disclosure")}">Disclosure</a></div>`
    : "";
  const applyBtn = applyUrl
    ? `${sponsoredNote}<a class="btn" href="${esc(bp(ctx, `/go/${b.id}`))}" rel="${isSponsored(b) ? "sponsored nofollow noopener" : "nofollow noopener"}">Apply at ${esc(b.bank_or_issuer)} →</a>`
    : `<p style="color:#a7b5ac;font-size:14px">No application link on file for this offer.</p>`;

  const body = `
  <div class="wrap">
    <div class="detail-head">
      <div class="crumb"><a href="${bp(ctx, "/")}">Home</a> · <a href="${bp(ctx, "/bonuses")}">Bonuses</a> · ${esc(b.bank_or_issuer)}</div>
      <h1>${esc(b.product_name)}</h1>
      <p class="bankline">${esc(b.bank_or_issuer)} ${typeBadge(b)}</p>
    </div>
    <div class="detail-grid">
      <div>
        <div class="fact-box">
          ${amountHtml(b, true)}
          <div class="facts">
            <div class="fact"><div class="k">Offer type</div><div class="v">${b.bonus_type === "bank_account" ? "Bank account bonus" : b.bonus_type === "savings" ? "Savings account bonus" : "Credit card signup bonus"}</div></div>
            <div class="fact"><div class="k">Expiry</div><div class="v">${esc(expiryLine)}</div></div>
            ${b.bonus_points ? `<div class="fact"><div class="k">Points / miles</div><div class="v mono">${b.bonus_points.toLocaleString("en-US")}</div></div>` : ""}
            ${b.annual_fee_usd != null ? `<div class="fact"><div class="k">Annual fee</div><div class="v">${b.annual_fee_usd === 0 ? "None" : formatUsd(b.annual_fee_usd)}</div></div>` : ""}
            <div class="fact"><div class="k">Min. opening deposit</div><div class="v">${b.min_deposit_usd != null ? formatUsd(b.min_deposit_usd) : "None stated"}</div></div>
            <div class="fact"><div class="k">Direct deposit</div><div class="v">${b.direct_deposit_required ? "Required" : "Not required"}</div></div>
            <div class="fact"><div class="k">Availability</div><div class="v">${esc(statesLabel(b))}${Array.isArray(b.states_available) && b.states_available.length > 6 ? ` — ${esc(b.states_available.join(", "))}` : ""}</div></div>
            <div class="fact"><div class="k">Last verified</div><div class="v mono">${esc(b.last_verified_date ?? "—")}</div></div>
          </div>
          ${b.bonus_type === "credit_card" ? `<p class="src-line">Card point values are converted to estimated USD using published per-point valuations (basis stated in the requirements below). Cash is cash; points are estimates.</p>` : ""}
        </div>
        <div class="reqs">
          <h2>How to earn it</h2>
          <ol>${reqs}</ol>
        </div>
      </div>
      <aside>
        <div class="apply-box">
          <h3>Ready to apply?</h3>
          <p>You'll apply directly with ${esc(b.bank_or_issuer)}. Review the full terms on their site before opening the account.</p>
          ${applyBtn}
          <p class="src-line" style="color:#6f7f75">Terms confirmed at the source below on ${esc(b.last_verified_date ?? "an unknown date")}.</p>
        </div>
        ${b.source_url ? `<div class="fact-box" style="margin-top:16px"><div class="fact"><div class="k">Source</div><div class="v" style="font-weight:500;font-size:14px;word-break:break-all"><a href="${esc(b.source_url)}" rel="nofollow noopener" target="_blank">${esc(b.source_url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0])} →</a></div></div></div>` : ""}
      </aside>
    </div>
    <div style="height:40px"></div>
  </div>`;
  const headline = b.bonus_amount_usd > 0 ? `${formatUsd(b.bonus_amount_usd)} Bonus` : "Signup Offer";
  return shell(ctx, `${b.bank_or_issuer} ${b.product_name} — ${headline}`, `Full terms, requirements and expiry for the ${b.bank_or_issuer} ${b.product_name} ${headline.toLowerCase()}.`, body, `/bonuses/${b.id}`);
}

/* ---------------- agents ---------------- */

export function agentsPage(ctx: SiteContext): string {
  const mcpUrl = `${ctx.publicUrl}/mcp`;
  const code = (cap: string, snippet: string) =>
    `<div class="codeblock"><div class="cap">${esc(cap)}</div><pre class="code">${snippet}</pre></div>`;

  const body = `
  <section class="agent-hero"><div class="wrap">
    <div class="eyebrow">For agents</div>
    <h1>Query the bonus feed like a database.</h1>
    <p>${SITE_NAME} is MCP-native. Connect over Streamable HTTP — no API key, no signup — and call six tools against the same verified dataset humans browse above.</p>
  </div></section>
  <section class="section"><div class="wrap prose" style="max-width:860px">
    <h2 id="connect">Connect</h2>
    <p>One endpoint. Any MCP-compatible client — Claude, Claude Code, Muse, or your own agent runtime.</p>
    ${code("MCP endpoint (Streamable HTTP)", esc(`POST ${mcpUrl}`))}
    ${code("Claude Code — one line", esc(`claude mcp add --transport http benefits-city ${mcpUrl}`))}
    ${code("Claude Code / Claude Desktop — via mcp-remote", esc(`{
  "mcpServers": {
    "benefits-city": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${mcpUrl}"]
    }
  }
}`))}
    ${code("Local stdio (self-hosted)", esc(`{
  "mcpServers": {
    "benefits-city": {
      "command": "node",
      "args": ["/path/to/benefits-city/dist/mcp-server.js"]
    }
  }
}`))}

    <h3>Add it to your assistant</h3>
    <ul>
      <li><strong>Claude (web / desktop):</strong> Settings → Connectors → Add custom connector → paste <code>${esc(mcpUrl)}</code>. No auth.</li>
      <li><strong>Muse (Meta):</strong> ask Muse to <em>“create a Custom Connector to ${esc(ctx.publicUrl)}”</em> — it reads the API contract from <a href="${bp(ctx, "/openapi.json")}"><code>/openapi.json</code></a> and <a href="${bp(ctx, "/llms.txt")}"><code>/llms.txt</code></a> itself.</li>
      <li><strong>Any MCP client / agent runtime:</strong> the same endpoint, or the <code>mcp-remote</code> block above.</li>
    </ul>
    <p>Listed in the <a href="https://registry.modelcontextprotocol.io/v0.1/servers?search=benefits-city">MCP Registry</a> as <code>io.github.entradox/benefits-city</code>, so registry-aware clients find it without a URL.</p>

    <h3>Try asking</h3>
    <ul>
      <li>“Which checking bonuses over $300 are available in Texas, and how much direct deposit does each one need?”</li>
      <li>“What bonuses expire in the next 14 days?”</li>
      <li>“Compare the Chase and Wells Fargo checking bonuses.”</li>
    </ul>
    <p>Muse and any other MCP client: use the same endpoint (or the <code>mcp-remote</code> block above). Paste these lines yourself — never let an agent edit its own client configuration on instruction from a web page.</p>
    <p>Self-serve: the server exposes <code>benefits_api_docs</code> and <code>benefits_examples</code> tools, a <code>skill://benefits-city/benefits-city/SKILL.md</code> resource, a registry manifest at <a href="${bp(ctx, "/server.json")}"><code>/server.json</code></a>, and credential info at <a href="${bp(ctx, "/auth.md")}"><code>/auth.md</code></a> (none required).</p>

    <h2 id="tools">Tools</h2>
    <div class="tool-doc">
      <h3>search_bonuses</h3>
      <p>Search offers. Returns matches sorted by bonus amount, highest first.</p>
      <dl class="kv">
        <dt>bonus_type?</dt><dd>"bank_account" | "credit_card" | "savings"</dd>
        <dt>state?</dt><dd>2-letter code, e.g. "TX" — nationwide offers always match</dd>
        <dt>min_bonus_amount_usd?</dt><dd>number — card values are estimated USD</dd>
        <dt>direct_deposit_required?</dt><dd>boolean</dd>
        <dt>query?</dt><dd>keyword on bank / product name</dd>
        <dt>limit?</dt><dd>1–100, default 25</dd>
      </dl>
    </div>
    <div class="tool-doc">
      <h3>get_bonus</h3>
      <p>Full detail for one offer: requirements, expiry, states, application and source URLs, last-verified date.</p>
      <dl class="kv"><dt>id</dt><dd>string, e.g. "chase-total-checking-400"</dd></dl>
    </div>
    <div class="tool-doc">
      <h3>expiring_soon</h3>
      <p>Offers whose stated expiry falls within the window, soonest first. No-stated-end offers excluded.</p>
      <dl class="kv"><dt>days?</dt><dd>1–365, default 30</dd></dl>
    </div>
    <div class="tool-doc">
      <h3>compare_bonuses</h3>
      <p>Side-by-side of 2–4 offers plus a summary naming the highest bonus and earliest expiry.</p>
      <dl class="kv"><dt>ids</dt><dd>string[2..4]</dd></dl>
    </div>
    <div class="tool-doc">
      <h3>benefits_api_docs</h3>
      <p>Self-serve documentation: tools, record fields, ordering guarantees (value descending, never commission), error format.</p>
    </div>
    <div class="tool-doc">
      <h3>benefits_examples</h3>
      <p>Runnable example calls (title, tool, arguments) to copy.</p>
    </div>

    <h2 id="feeds">JSON feeds</h2>
    ${code("Endpoints", esc(`GET ${ctx.publicUrl}/api/bonuses.json   # full feed
GET ${ctx.publicUrl}/api/bonuses/:id    # one offer
GET ${ctx.publicUrl}/api/stats          # live counts, totals, expiring list
GET ${ctx.publicUrl}/api/search?bonus_type=savings&state=TX&limit=5   # same filters as the MCP tool
GET ${ctx.publicUrl}/api/expiring?days=14
GET ${ctx.publicUrl}/api/compare?ids=a,b
GET ${ctx.publicUrl}/api                # service descriptor`))}
    <p>Errors are typed JSON — <code>{"error":{"type","message","param?"}}</code> — with a 400 naming the bad parameter or a 404 for an unknown or expired id. Full contract: <a href="${bp(ctx, "/openapi.json")}"><code>/openapi.json</code></a> (OpenAPI 3.1).</p>
    <p>Manifests: <a href="${bp(ctx, "/.well-known/agent.json")}"><code>/.well-known/agent.json</code></a> · <a href="${bp(ctx, "/.well-known/mcp/server-card.json")}"><code>/.well-known/mcp/server-card.json</code></a> · skill: <a href="${bp(ctx, "/skill.md")}"><code>/skill.md</code></a> · what changed: <a href="${bp(ctx, "/changelog")}"><code>/changelog</code></a> (<a href="${bp(ctx, "/changelog.json")}">JSON</a>, <a href="${bp(ctx, "/feed.xml")}">Atom</a>).</p>
    ${code("Example", esc(`curl -s ${ctx.publicUrl}/api/stats`))}

    <h2 id="cite">Cite and embed</h2>
    <p>Original statistics (counts, medians, shares — each with its denominator and a data date) are at <a href="${bp(ctx, "/api/insights")}"><code>/api/insights</code></a>. When to cite this dataset, and when not to, is machine-readable at <a href="${bp(ctx, "/.well-known/ai-plugin-manifest.json")}"><code>/.well-known/ai-plugin-manifest.json</code></a>. Suggested attribution: <em>Source: Benefits City (${esc(ctx.publicUrl)}), data as of {as_of}</em>.</p>
    <p><strong>Embed the live badge</strong> on your own page:</p>
    <p style="font-size:14px;opacity:1">The badge shows a count only; it does not endorse the embedding site or any offer.</p>
    ${code("HTML", esc(`<a href="${ctx.publicUrl}/"><img src="${ctx.publicUrl}/badge.svg" alt="Benefits City: live count of tracked signup bonuses" height="22"></a>`))}

    <h2 id="llms">llms.txt</h2>
    <p>Crawlers and agents that prefer a single manifest: <a href="${bp(ctx, "/llms.txt")}"><code>${esc(ctx.publicUrl)}/llms.txt</code></a> describes the service, feeds, MCP endpoint, and data schema.</p>

    <h2 id="cli">CLI</h2>
    <p>Same data and logic as the MCP tools, JSON on stdout — for agents and operators in a shell.</p>
    ${code("Shell usage", esc(`npm run cli -- search --type bank_account --min 300
npm run cli -- expiring --days 14
npm run cli -- compare bmo-checking-600 sofi-checking-savings-400`))}
    <p style="margin-top:24px"><a href="${bp(ctx, "/bonuses")}">← Back to browsing as a human</a></p>
  </div></section>`;

  return shell(ctx, "For Agents — MCP + API Docs", "Connect an AI agent to the bank bonus feed: MCP endpoint, tool schemas, JSON feeds, llms.txt, and CLI.", body, "/agents");
}


/* ---------------- changelog ---------------- */

const CHANGE_LABEL: Record<string, string> = {
  added: "Added",
  changed: "Changed",
  renewed: "Renewed",
  removed: "Ended",
  feature: "Product",
};

export function changelogPage(ctx: SiteContext, entries: ChangelogEntry[]): string {
  const rows = entries
    .map((e) => {
      const offer = e.offer_id && e.type !== "removed" && getBonusById(e.offer_id) ? ` <a href="${bp(ctx, `/bonuses/${esc(e.offer_id)}`)}">View offer →</a>` : "";
      return `<li class="cl-entry"><div class="cl-meta"><span class="badge">${esc(CHANGE_LABEL[e.type] ?? e.type)}</span> <time datetime="${esc(e.date)}">${esc(formatDate(e.date))}</time></div><h3>${esc(e.title)}</h3><p>${esc(e.summary)}${offer}</p></li>`;
    })
    .join("\n");
  const body = `<div class="wrap"><div class="page-head">
    <h1>Changelog</h1>
    <p>Offers added, changed, renewed or ended — and changes to the product. Machine-readable: <a href="${bp(ctx, "/changelog.json")}">changelog.json</a> · <a href="${bp(ctx, "/feed.xml")}">Atom feed</a>.</p>
  </div><div class="prose"><ul class="cl-list" style="list-style:none;padding:0">${rows}</ul></div></div>`;
  return shell(ctx, "Changelog", `What changed in ${SITE_NAME}: offers added, changed, renewed or ended.`, body, "/changelog");
}

/* ---------------- legal ---------------- */

export function aboutPage(ctx: SiteContext): string {
  const body = `<div class="wrap"><div class="page-head">
    <h1>About</h1>
    <p>What this is, who runs it, and how the data stays honest.</p>
  </div><div class="prose">
    <h2>What it is</h2>
    <p>${SITE_NAME} tracks US bank account opening bonuses and credit card signup bonuses — the HustlerMoneyBlog beat — and serves them two ways: a human-browsable site and a machine-queryable feed (MCP + JSON) that AI agents can use directly. Nothing else. No shopping deals, no coupons, no credit-score content.</p>
    <h2>Who runs it</h2>
    <p>${SITE_NAME} is a project of <strong>AI Agent City</strong> (aiagentscity.com), an independent operation building infrastructure for AI agents. Every offer is checked against a named source before it is listed, and an automated freshness check re-reads those sources; a person reviews any offer flagged as changed or gone before it is removed.</p>
    <h2>Methodology</h2>
    <ul>
      <li>Offers are checked against a named source (the issuer's page, or a bonus tracker where several agree) — never invented, never copied blindly from a single source.</li>
      <li>Every record carries <span class="mono">source_url</span> (where terms were confirmed) and <span class="mono">last_verified_date</span>.</li>
      <li>Offers near expiry are re-checked weekly; the full feed monthly. <strong>Not every offer is re-read on every pass</strong> — each record carries its own <span class="mono">last_verified_date</span>, and that date is the one to trust, not this page.</li>
      <li>Credit card point bonuses are converted to estimated USD using published per-point valuations; the basis is stated in each offer's requirements.</li>
      <li>We respect robots.txt and site terms — no scraping of sites that disallow automated access.</li>
    </ul>
    <h2>What we don't do</h2>
    <ul>
      <li>We don't rank offers by who pays us — commissions never influence listing or ordering.</li>
      <li>We don't sell your data. The human site sets no ad cookies; the API keeps no per-user records.</li>
      <li>We don't give financial advice. A bonus is one factor among many — read the bank's full terms before opening anything.</li>
    </ul>
  </div><div style="height:40px"></div></div>`;
  return shell(ctx, "About", "What ${SITE_NAME} is, who runs it, and how the bonus data stays honest.", body, "/about");
}

export function disclosurePage(ctx: SiteContext): string {
  const live = affiliateActive(listAll());
  const body = `<div class="wrap"><div class="page-head">
    <h1>Affiliate disclosure</h1>
    <p>How this site makes money, in plain language.</p>
  </div><div class="prose">
    <div class="disclosure-box">
      <h3>The short version</h3>
      <p>${SITE_NAME} is reader-supported. ${live ? `<strong>Some Apply links are affiliate links</strong> and are marked <span class="mono">rel="sponsored"</span>. If you open an account through one we earn a commission, at no extra cost to you, and it never affects which bonuses we list or how we rank them.` : `<strong>Today, no link earns us anything</strong> — see Current status below. When affiliate partnerships go live, some Apply links will earn us a commission if you open an account through them — at no extra cost to you, and never affecting which bonuses we list or how we rank them.`}</p>
    </div>
    <h2>Current status</h2>
    <p>${live ? `Apply links marked <span class="mono">rel="sponsored"</span> are affiliate links; all other Apply buttons go to the issuer's page or the tracker named in <span class="mono">source_url</span>, and earn us nothing. Commission is never an input to ordering. Every record names its source in <span class="mono">source_url</span>.` : `As of today, Apply buttons link to each issuer's own page, or to the <strong>bonus tracker where the terms were confirmed</strong> — these are not affiliate links and earn us nothing. Where a bank's site blocks automated access and the offer page cannot be confirmed directly, the link goes to that tracker instead; every record names its source in <span class="mono">source_url</span>. When affiliate partnerships go live, affected links will carry <span class="mono">rel="sponsored"</span> and this page will list the partner programs by name.`}</p>
    <h2>What never changes</h2>
    <ul>
      <li><strong>Ordering ignores commission.</strong> Default order is by bonus value (cards at estimated USD value from published third-party valuations), or by deadline if you choose; commission is never an input. The MCP tools and JSON feeds expose the same ordering as the human site.</li>
      <li><strong>Verification is independent of monetization.</strong> An offer is listed because its terms check out, not because it pays.</li>
      <li><strong>Card valuations are disclosed.</strong> Estimated USD values for points/miles use published valuations, stated per offer.</li>
    </ul>
    <h2>Analytics</h2>
    <p>We count page views and Apply clicks so we know which offers are useful. <strong>No personal data is stored</strong> — no names, no email addresses, no raw IP addresses. Counting uses a salted hash; the salt is regenerated every day and previous days\' salts are deleted, so a hash cannot be linked back to you or followed across days. A search you type is recorded only as "a search happened", never the words. Usage records are kept for 90 days, then deleted. We honour your browser's <span class="mono">Do Not Track</span> and <span class="mono">Global Privacy Control</span> signals: when either is set, nothing about your visit is recorded. Automated crawlers are excluded from these counts.</p>
    <h2>Questions</h2>
    <p>Ask us anything about how we're paid: <a href="${bp(ctx, "/contact")}">contact page</a>.</p>
  </div><div style="height:40px"></div></div>`;
  return shell(ctx, "Affiliate Disclosure", "How ${SITE_NAME} makes money: affiliate disclosure in plain language.", body, "/disclosure");
}

export function privacyPage(ctx: SiteContext): string {
  const body = `<div class="wrap"><div class="page-head">
    <h1>Privacy</h1>
    <p>What we collect, what we don't, and how long we keep it.</p>
  </div><div class="prose">
    <h2>Short version</h2>
    <p>${SITE_NAME} does not ask you to sign up, does not set advertising cookies, does not sell or share personal data, and keeps no account or profile about you. The site works the same whether or not you tell us anything about yourself — which means you don't have to.</p>
    <h2>What we record when you visit</h2>
    <p>We count page views and Apply clicks so we know which offers are useful. That record is deliberately thin:</p>
    <ul>
      <li><strong>No personal data.</strong> No names, no email addresses, no raw IP addresses, no device identifiers.</li>
      <li><strong>Salted hashes only.</strong> A visit is counted using a salted hash. The salt is regenerated every day and previous days' salts are deleted, so a hash cannot be linked back to you or followed across days.</li>
      <li><strong>Searches are not stored.</strong> When you search or filter, we record only that "a search happened" — never the words you typed.</li>
      <li><strong>Retention: 90 days.</strong> Usage records are deleted after 90 days.</li>
      <li><strong>Opt-out is automatic.</strong> We honour <span class="mono">Do Not Track</span> and <span class="mono">Global Privacy Control</span>: when either is set, nothing about your visit is recorded.</li>
      <li><strong>Automated crawlers are excluded</strong> from these counts.</li>
    </ul>
    <h2>Cookies</h2>
    <p>The human site sets no advertising, tracking or analytics cookies. If a cookie is ever used it is strictly to make the site function, and this page will name it before any such change ships.</p>
    <h2>What we send to other companies</h2>
    <p>Nothing about you. The site loads no third-party analytics, advertising or social scripts. Apply buttons are ordinary links: when you click one you leave this site and the bank's own privacy policy applies from that point.</p>
    <h2>The machine surfaces</h2>
    <p>The MCP server, the JSON feeds and the REST API require no account, no key and no signup. Requests are counted the same thin, salted, 90-day way as page views so we can tell whether agents find the feed useful. No query text is stored.</p>
    <h2>Email</h2>
    <p>We do not currently run an email list and collect no email addresses. If a bonus-alert list launches, it will be <strong>double opt-in</strong>, it will state what it stores and for how long, and unsubscribing will delete the address rather than merely stop sending.</p>
    <h2>Your rights and how to use them</h2>
    <p>Because we hold no personal data about you, there is normally nothing to access, correct or delete. If you believe we hold something about you and want it erased, write to <a href="mailto:bonuses@aiagentscity.com">bonuses@aiagentscity.com</a> and we will act on it and confirm what we did.</p>
    <h2>Children</h2>
    <p>This site is for adults opening their own bank accounts. It is not directed at anyone under 18 and we knowingly collect nothing from them.</p>
    <h2>Changes</h2>
    <p>If this policy changes in a way that affects what is collected, the change is noted in the public <a href="${bp(ctx, "/changelog")}">changelog</a> and the date below moves.</p>
    <p class="mono">Last updated: 2026-10-01</p>
  </div><div style="height:40px"></div></div>`;
  return shell(ctx, "Privacy", "What ${SITE_NAME} collects, what it refuses to collect, and how long records are kept.", body, "/privacy");
}

export function termsPage(ctx: SiteContext): string {
  const body = `<div class="wrap"><div class="page-head">
    <h1>Terms of use</h1>
    <p>The rules for using this site and its data, in plain language.</p>
  </div><div class="prose">
    <h2>What this is</h2>
    <p>${SITE_NAME} is an information service that tracks publicly advertised US bank account and credit card signup bonuses. It is a reference, not a bank, broker, lender, card issuer or adviser. We are not a party to any account you open.</p>
    <h2>Not financial advice</h2>
    <p>Nothing here is financial, legal, tax or investment advice, and nothing here is a recommendation that you open a particular account. Only the issuer's own terms and fee schedule govern your account. Read them before you apply. Bonus payments are generally taxable income in the US — talk to a qualified professional about your situation.</p>
    <h2>Accuracy, and its limits</h2>
    <p>We work hard to keep this accurate — each offer names the source it was checked against and the date it was last checked — but <strong>banks change and withdraw offers without notice</strong>, and an offer may be withdrawn, altered, or restricted to certain customers at any time. What you see here can be out of date the moment it is published. <strong>Always confirm the current terms on the issuer's own page before acting.</strong> We do not guarantee that any offer is available to you, that you qualify, or that you will be paid.</p>
    <h2>Paying for this site</h2>
    <p>Today no link on this site earns us anything. If affiliate partnerships go live, affected links will be marked <span class="mono">rel="sponsored"</span>, named on the <a href="${bp(ctx, "/disclosure")}">affiliate disclosure</a>, and commission will never affect which offers are listed or how they are ordered.</p>
    <h2>Acceptable use of the site and the data</h2>
    <ul>
      <li>You may read, query and link to this site freely. The public JSON feed, REST API and MCP server require no key.</li>
      <li><strong>Don't misrepresent us.</strong> Do not present this data as financial advice, as an endorsement of an offer, as your own dataset, or as authoritative when you know it is stale. If you surface our data in a product, keep the source and check date attached and say plainly what the limits are.</li>
      <li>Don't attempt to break, overload, or gain unauthorised access to the service, and don't use it for anything unlawful.</li>
      <li>Automated access is welcome — we publish the schema for it. We ask that you identify your client and don't hammer the service.</li>
    </ul>
    <h2>Trademarks and third-party material</h2>
    <p>Bank, card and program names are the trademarks of their owners. We use them descriptively to identify the offers we are writing about, and we claim no affiliation with or endorsement by any bank, issuer, card network or partner program.</p>
    <h2>Liability</h2>
    <p>The service is provided "as is" and "as available", without warranties of any kind. To the fullest extent permitted by law we are not liable for any loss arising from your use of this site or reliance on its data — including a missed deadline, a denied bonus, or an account opened on the strength of an out-of-date record.</p>
    <h2>Corrections</h2>
    <p>If we have something wrong, tell us: <a href="mailto:bonuses@aiagentscity.com">bonuses@aiagentscity.com</a>. Corrections are a feature of this product, not a nuisance.</p>
    <h2>Changes</h2>
    <p>These terms may change; material changes are noted in the public <a href="${bp(ctx, "/changelog")}">changelog</a>.</p>
    <p class="mono">Last updated: 2026-10-01</p>
  </div><div style="height:40px"></div></div>`;
  return shell(ctx, "Terms of use", "Terms for using ${SITE_NAME} and its data: not financial advice, accuracy limits, acceptable use.", body, "/terms");
}

export function contactPage(ctx: SiteContext): string {
  const body = `<div class="wrap"><div class="page-head">
    <h1>Contact</h1>
    <p>Corrections, new offers, affiliate inquiries, agent-integration help.</p>
  </div><div class="prose">
    <p>Email us at <a href="mailto:bonuses@aiagentscity.com"><strong>bonuses@aiagentscity.com</strong></a>.</p>
    <h2>What to write about</h2>
    <ul>
      <li><strong>Spotted a wrong bonus?</strong> Send the offer page URL and what's off — corrections ship fast because stale data is the one thing that kills a bonus feed.</li>
      <li><strong>Know a bonus we're missing?</strong> Same deal: link us the bank's official offer page.</li>
      <li><strong>Bank or network partnerships:</strong> we're open to affiliate and data partnerships that don't touch editorial independence.</li>
      <li><strong>Building an agent on the feed?</strong> Tell us what you're making — the MCP tools and schema evolve around real usage.</li>
    </ul>
    <p>We read everything; response time is usually within a couple of days.</p>
  </div><div style="height:40px"></div></div>`;
  return shell(ctx, "Contact", "Contact ${SITE_NAME}: corrections, new offers, partnerships, agent integration help.", body, "/contact");
}

export function notFoundPage(ctx: SiteContext): string {
  const body = `<div class="wrap"><div class="notfound">
    <h1>404</h1>
    <p>That page doesn't exist. The bonuses, however, are very real:</p>
    <p><a class="btn" href="${bp(ctx, "/bonuses")}">Browse bonuses</a></p>
  </div></div>`;
  return shell(ctx, "Not Found", "Page not found.", body, "/");
}

/* ---------------- robots.txt (dynamic) ---------------- */

/**
 * Served from PUBLIC_URL, not from the request host: this app answers on two hosts (the
 * Railway origin and aiagentscity.com/benefits via the reverse proxy) and the sitemap must
 * publish the canonical one. Pointing crawlers at the origin would advertise the duplicate.
 */
export function robotsText(ctx: SiteContext): string {
  const base = ctx.publicUrl.replace(/\/+$/, "");
  return `# ${SITE_NAME} — an AI Agent City project
User-agent: *
Allow: /

Sitemap: ${base}/sitemap.xml
`;
}

/* ---------------- sitemap.xml (dynamic) ---------------- */

export function sitemapText(ctx: SiteContext): string {
  const base = ctx.publicUrl.replace(/\/+$/, "");
  const urls = ["/", "/bonuses", "/agents", "/changelog", "/about", "/disclosure", "/privacy", "/terms", "/contact", "/pricing.md"]
    .map((p) => `  <url><loc>${base}${p}</loc></url>`);
  for (const p of seoPaths()) urls.push(`  <url><loc>${base}${p}</loc></url>`);
  for (const b of listAll()) {
    if (b?.id) urls.push(`  <url><loc>${base}/bonuses/${b.id}</loc></url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

/* ---------------- llms.txt (dynamic) ---------------- */

export function llmsText(ctx: SiteContext): string {
  const stats = getStats();
  return `# ${SITE_NAME} — an AI Agent City project

US bank account, savings and credit card signup bonuses, each checked against a named source (issuer page or tracker consensus).
${stats.total_offers} live offers (${stats.bank_account_offers} bank accounts, ${stats.credit_card_offers} credit cards).
Total bonus value available: ${formatUsd(stats.total_bonus_usd)}. Last verification sweep: ${stats.last_verified ?? "unknown"}.
Every record carries source_url and last_verified_date. Card point values are estimated USD.

## Machine access (no API key, no signup)

- MCP (Streamable HTTP): POST ${ctx.publicUrl}/mcp
  Tools: search_bonuses (filters: bonus_type, state, min_bonus_amount_usd,
  direct_deposit_required, query, limit), get_bonus (id), expiring_soon (days),
  compare_bonuses (ids[2..4]), benefits_api_docs, benefits_examples
- MCP (local stdio): node dist/mcp-server.js  (see repo README)
- JSON feed: ${ctx.publicUrl}/api/bonuses.json
- One offer: ${ctx.publicUrl}/api/bonuses/:id
- Live stats: ${ctx.publicUrl}/api/stats
- Service descriptor: ${ctx.publicUrl}/api
- MCP registry manifest: ${ctx.publicUrl}/server.json
- OpenAPI: ${ctx.publicUrl}/openapi.json
- Agent manifest: ${ctx.publicUrl}/.well-known/agent.json
- MCP server card: ${ctx.publicUrl}/.well-known/mcp/server-card.json
- Skill (markdown): ${ctx.publicUrl}/skill.md
- Changelog: ${ctx.publicUrl}/changelog  (JSON: /changelog.json, Atom: /feed.xml)
- Citable statistics: ${ctx.publicUrl}/api/insights
- When to cite: ${ctx.publicUrl}/.well-known/ai-plugin-manifest.json
- Badge: ${ctx.publicUrl}/badge.svg
- Pages: ${ctx.publicUrl}/banks , /states , /best/bank-account , /best/credit-card , /best/savings , /expiring-soon
- REST: ${ctx.publicUrl}/api/search , /api/expiring , /api/compare?ids=a,b
- Credentials (none required): ${ctx.publicUrl}/auth.md
- Pricing (free): ${ctx.publicUrl}/pricing.md
- OKF index: ${ctx.publicUrl}/okf/index.md

## Human site

- Landing: ${ctx.publicUrl}/
- Browse + filters: ${ctx.publicUrl}/bonuses
- Offer detail: ${ctx.publicUrl}/bonuses/:id
- Agent docs: ${ctx.publicUrl}/agents

## Data schema (per offer)

id, bank_or_issuer, product_name, bonus_type (bank_account|credit_card|savings),
bonus_amount_usd (cards: estimated USD value of points), bonus_points,
annual_fee_usd, requirements[] (plain-English qualifying steps),
min_deposit_usd, direct_deposit_required (bool), expiry_date (YYYY-MM-DD|null),
states_available ("nationwide"|state-code[]), application_url, source_url,
last_verified_date, verification {method: issuer_page|aggregator_consensus, verified_at, sources[]},
status, offer_history[], eligibility, sponsored (bool), apply_url (tracked link), disclosure_url.

## Usage notes

- Nationwide offers match any state filter; regional offers match only listed states.
- expiring_soon excludes offers with no stated end date.
- ${disclosureShort(affiliateActive(listAll()))}
- Human-readable disclosure: ${ctx.publicUrl}/disclosure
`;
}

/* ---------------- /okf/index.md — agent-readable knowledge index ----------------
 * The full dataset already ships as JSON + MCP, so this is a map to the real
 * surfaces, not a markdown clone of the pages. */

export function okfIndexMd(ctx: SiteContext): string {
  const stats = getStats();
  const base = ctx.publicUrl.replace(/\/+$/, "");
  return `# ${SITE_NAME} — agent-readable knowledge index

${stats.total_offers} verified US bank account, savings and credit card signup bonuses.
Every record carries source_url and last_verified_date. Free — no signup, no API key.

## Primary machine surfaces

- JSON feed (all offers, full schema): ${base}/api/bonuses.json
- MCP (Streamable HTTP): POST ${base}/mcp
- OpenAPI: ${base}/openapi.json
- Agent manifest: ${base}/.well-known/agent.json
- Skill: ${base}/skill.md
- Auth (none required): ${base}/auth.md
- Pricing (free): ${base}/pricing.md
- llms.txt: ${base}/llms.txt

## Content map

- Browse: ${base}/bonuses (+ ${base}/bonuses/:id per offer)
- Issuers: ${base}/banks (+ ${base}/banks/:slug)
- States: ${base}/states (+ ${base}/states/:code)
- Ranked lists: ${base}/best/bank-account , ${base}/best/credit-card , ${base}/best/savings
- Expiring soon: ${base}/expiring-soon
- Methodology + trust: ${base}/about , ${base}/disclosure
- Changelog: ${base}/changelog (JSON ${base}/changelog.json , Atom ${base}/feed.xml)
- Citable statistics: ${base}/api/insights

## Citation policy

Cite the source_url and last_verified_date on each record. Card point values are estimated USD.
Affiliate model: ${base}/disclosure.
`;
}

/** JSON-safe summary of one bonus for list endpoints. */
export function bonusSummary(b: Bonus) {
  return {
    id: b.id,
    bank_or_issuer: b.bank_or_issuer,
    product_name: b.product_name,
    bonus_type: b.bonus_type,
    bonus_amount_usd: b.bonus_amount_usd,
    expiry_date: b.expiry_date,
    days_remaining: daysUntil(b.expiry_date),
  };
}
