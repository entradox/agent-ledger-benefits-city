/**
 * Benefits City — server-rendered hybrid site (humans + agents).
 *
 * All internal links, asset paths, and form actions go through `bp()` so the
 * whole site works under a BASE_PATH (e.g. "/bonuses" behind aiagentscity.com).
 * Data is rendered live from the real bonus database — nothing is hardcoded.
 */
import { expiringSoon, getBonusById, listAll, searchBonuses } from "./db.js";
import { affiliateActive, disclosureShort, isSponsored, resolveApplyUrl } from "./links.js";
import { daysUntil, formatDate, formatUsd, getStats } from "./stats.js";
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
  return `<div class="${cls}">${formatUsd(b.bonus_amount_usd)}${note}</div>`;
}

function bonusCard(ctx: SiteContext, b: Bonus): string {
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

function footer(ctx: SiteContext): string {
  return `<footer class="footer"><div class="wrap">
    <div class="footer-grid">
      <div class="blurb">
        <a class="brand" href="${bp(ctx, "/")}"><span class="brand-mark">B</span><span>${SITE_NAME}</span></a>
        <p>Every US bank account opening bonus and credit card signup bonus worth knowing about — verified by hand, structured for humans and AI agents alike. An AI Agent City project.</p>
      </div>
      <div><h4>Explore</h4><ul>
        <li><a href="${bp(ctx, "/bonuses")}">Browse bonuses</a></li>
        <li><a href="${bp(ctx, "/bonuses?type=bank_account")}">Bank account bonuses</a></li>
        <li><a href="${bp(ctx, "/bonuses?type=credit_card")}">Credit card bonuses</a></li>
        <li><a href="${bp(ctx, "/agents")}">For agents</a></li>
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
        <li><a href="${bp(ctx, "/contact")}">Contact</a></li>
      </ul></div>
    </div>
    <div class="footer-bottom">
      <span>© 2026 AI Agent City</span>
      <span>data verified by hand · every offer carries its source</span>
    </div>
  </div></footer>`;
}

function shell(ctx: SiteContext, title: string, desc: string, body: string, path = "/"): string {
  // Canonical + og:url are derived from ctx.publicUrl (the PUBLIC_URL env), never from the
  // request Host header. That matters because this app is reachable on two hosts — the
  // Railway origin and aiagentscity.com/benefits through the reverse proxy — and they serve
  // identical content. Self-referencing from the request host would let the origin declare
  // ITSELF canonical, which is the duplicate-content problem rather than the fix.
  // ctx.publicUrl already carries the /benefits base, so no bp() here.
  const canonical = `${ctx.publicUrl.replace(/\/+$/, "")}${path === "/" ? "/" : path}`;
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
          <td class="amt">${formatUsd(b.bonus_amount_usd)}${b.bonus_type === "credit_card" ? " <span class='badge'>est.</span>" : ""}</td>
          <td>${expiryBadge(b)}</td>
        </tr>`,
      )
      .join("");

  const expiringCards = expiring.map((b) => bonusCard(ctx, b)).join("");

  const body = `
  <section class="hero"><div class="wrap">
    <div class="eyebrow">AI Agent City · Benefits</div>
    <h1>Every US bank bonus. <span class="hl">Verified by hand.</span></h1>
    <p class="lede">${stats.total_offers} verified bank account and credit card signup bonuses — browsable by humans, queryable by AI agents over MCP. Every offer carries its source and last-verified date. No invented deals, ever.</p>
    <div class="hero-ctas">
      <a class="btn" href="${bp(ctx, "/bonuses")}">Browse bonuses</a>
      <a class="btn btn-dark-outline" href="${bp(ctx, "/agents")}">Connect an agent →</a>
    </div>
    <div class="stat-row">
      <div class="stat"><div class="v">${stats.total_offers}</div><div class="k">live offers tracked</div><div class="n">${stats.bank_account_offers} bank · ${stats.credit_card_offers} cards</div></div>
      <div class="stat"><div class="v mint">${formatUsd(stats.total_bonus_usd)}</div><div class="k">total bonus value available</div><div class="n">card points at est. USD value</div></div>
      <div class="stat"><div class="v">${stats.expiring_within_30d.length}</div><div class="k">expiring within 30 days</div><div class="n">act before the deadline</div></div>
      <div class="stat"><div class="v">${esc(stats.last_verified ?? "—")}</div><div class="k">last verification sweep</div><div class="n">checked by hand, not scraped</div></div>
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
      <div class="step"><div class="num">02</div><h3>We verify</h3><p>Each offer's terms are confirmed by hand against the bank's own pages. Every record is stamped with its source URL and verification date.</p></div>
      <div class="step"><div class="num">03</div><h3>You act</h3><p>Browse here, or have your agent query the MCP feed — then apply directly with the bank. Nothing to sign up for, no paywall.</p></div>
    </div>
  </div></section>

  <section class="section-tight"><div class="wrap">
    <h2>Questions, answered honestly</h2>
    <div style="max-width:760px;margin-top:20px">
      <details class="faq"><summary>Is this free?</summary><p>Yes. No signup, no paywall, no account. Agents query the MCP server and JSON feeds free too — no API key.</p></details>
      <details class="faq"><summary>Where does the data come from?</summary><p>Every offer is verified by hand against the bank's official offer page or a reputable bonus tracker. Each record carries a <span class="mono">source_url</span> and <span class="mono">last_verified_date</span>. Offers we can't verify don't get listed.</p></details>
      <details class="faq"><summary>Are the Apply links affiliate links?</summary><p>${esc(disclosureShort(affiliateActive(listAll())))} See the <a href="${bp(ctx, "/disclosure")}">full disclosure</a>.</p></details>
      <details class="faq"><summary>How do credit card point values work?</summary><p>Points and miles are converted to USD using published per-point valuations so cards compare fairly with cash bonuses. The valuation basis is stated in each offer's requirements. Cash is cash; points are estimates.</p></details>
      <details class="faq"><summary>How often is the data re-verified?</summary><p>Offers near expiry are re-checked weekly; the full feed is re-verified on a rolling monthly cadence. Every record shows exactly when it was last confirmed.</p></details>
      <details class="faq"><summary>I'm an AI agent. How do I use this?</summary><p>Connect to the MCP server over Streamable HTTP, pull the JSON feeds, or read <a href="${bp(ctx, "/llms.txt")}">llms.txt</a>. Full copy-paste instructions are on the <a href="${bp(ctx, "/agents")}">For agents</a> page.</p></details>
    </div>
    <div class="disclosure-box">
      <h3>Affiliate disclosure</h3>
      <p>${SITE_NAME} is reader-supported. ${esc(disclosureShort(affiliateActive(listAll())))} <a href="${bp(ctx, "/disclosure")}">Read the full disclosure →</a></p>
    </div>
  </div></section>`;

  return shell(ctx, "US Bank & Credit Card Signup Bonuses, Verified", "Every verified US bank account opening bonus and credit card signup bonus — browsable by humans, queryable by AI agents over MCP.", body, "/");
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
  if (query.state.trim()) filters.state = query.state.trim().toUpperCase();
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
      <p>${results.length} verified offer${results.length === 1 ? "" : "s"} · every one hand-checked with its source on record.</p>
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
  return shell(ctx, "Browse Bonuses", "Search and filter every verified US bank account and credit card signup bonus.", body, "/bonuses");
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
  const applyBtn = applyUrl
    ? `<a class="btn" href="${esc(bp(ctx, `/go/${b.id}`))}" rel="${isSponsored(b) ? "sponsored nofollow noopener" : "nofollow noopener"}">Apply at ${esc(b.bank_or_issuer)} →</a>`
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
  return shell(ctx, `${b.bank_or_issuer} ${b.product_name} — ${formatUsd(b.bonus_amount_usd)} Bonus`, `Full terms, requirements and expiry for the ${b.bank_or_issuer} ${b.product_name} ${formatUsd(b.bonus_amount_usd)} bonus.`, body, `/bonuses/${b.id}`);
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
    <p>${SITE_NAME} is MCP-native. Connect over Streamable HTTP — no API key, no signup — and call four tools against the same verified dataset humans browse above.</p>
  </div></section>
  <section class="section"><div class="wrap prose" style="max-width:860px">
    <h2 id="connect">Connect</h2>
    <p>One endpoint. Any MCP-compatible client — Claude, Claude Code, Muse, or your own agent runtime.</p>
    ${code("MCP endpoint (Streamable HTTP)", esc(`POST ${mcpUrl}`))}
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
      <dl class="kv"><dt>id</dt><dd>string, e.g. "chase-total-checking-300"</dd></dl>
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

    <h2 id="feeds">JSON feeds</h2>
    ${code("Endpoints", esc(`GET ${ctx.publicUrl}/api/bonuses.json   # full feed
GET ${ctx.publicUrl}/api/bonuses/:id    # one offer
GET ${ctx.publicUrl}/api/stats          # live counts, totals, expiring list
GET ${ctx.publicUrl}/api                # service descriptor`))}
    ${code("Example", esc(`curl -s ${ctx.publicUrl}/api/stats`))}

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

/* ---------------- legal ---------------- */

export function aboutPage(ctx: SiteContext): string {
  const body = `<div class="wrap"><div class="page-head">
    <h1>About</h1>
    <p>What this is, who runs it, and how the data stays honest.</p>
  </div><div class="prose">
    <h2>What it is</h2>
    <p>${SITE_NAME} tracks US bank account opening bonuses and credit card signup bonuses — the HustlerMoneyBlog beat — and serves them two ways: a human-browsable site and a machine-queryable feed (MCP + JSON) that AI agents can use directly. Nothing else. No shopping deals, no coupons, no credit-score content.</p>
    <h2>Who runs it</h2>
    <p>${SITE_NAME} is a project of <strong>AI Agent City</strong> (aiagentscity.com), an independent operation building infrastructure for AI agents. The feed is maintained by a small team: automated monitoring finds candidate offers, and a human confirms every offer's terms before it ships.</p>
    <h2>Methodology</h2>
    <ul>
      <li>Offers are verified against the bank's official offer page or a reputable bonus tracker — never invented, never copied blindly from a single source.</li>
      <li>Every record carries <span class="mono">source_url</span> (where terms were confirmed) and <span class="mono">last_verified_date</span>.</li>
      <li>Offers near expiry are re-checked weekly; the full feed on a rolling monthly cadence.</li>
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
    <p>${live ? `Apply links marked <span class="mono">rel="sponsored"</span> are affiliate links; all other Apply buttons link to the issuer's <strong>official offer page</strong> and earn us nothing. Ranking is by bonus value only, never by commission. Every record names its source in <span class="mono">source_url</span>.` : `As of today, Apply buttons link to each bank's <strong>official offer page</strong> — these are not affiliate links and earn us nothing. Where a bank's site blocks automated access and the offer page cannot be confirmed directly, the link goes to the <strong>reputable bonus tracker where the terms were confirmed</strong> instead; every record names its source in <span class="mono">source_url</span>. When affiliate partnerships go live, affected links will carry <span class="mono">rel="sponsored"</span> and this page will list the partner programs by name.`}</p>
    <h2>What never changes</h2>
    <ul>
      <li><strong>Ranking is by bonus value and deadline</strong> — never by commission rate. The MCP tools and JSON feeds expose the same ordering as the human site.</li>
      <li><strong>Verification is independent of monetization.</strong> An offer is listed because its terms check out, not because it pays.</li>
      <li><strong>Card valuations are disclosed.</strong> Estimated USD values for points/miles use published valuations, stated per offer.</li>
    </ul>
    <h2>Analytics</h2>
    <p>We count page views and Apply clicks so we know which offers are useful. <strong>No personal data is stored</strong> — no names, no email addresses, no raw IP addresses. Counting uses a salted hash that is regenerated every day and cannot be linked back to you or followed across days. We honour your browser's <span class="mono">Do Not Track</span> and <span class="mono">Global Privacy Control</span> signals: when either is set, nothing about your visit is recorded. Automated crawlers are excluded from these counts.</p>
    <h2>Questions</h2>
    <p>Ask us anything about how we're paid: <a href="${bp(ctx, "/contact")}">contact page</a>.</p>
  </div><div style="height:40px"></div></div>`;
  return shell(ctx, "Affiliate Disclosure", "How ${SITE_NAME} makes money: affiliate disclosure in plain language.", body, "/disclosure");
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
  const urls = ["/", "/bonuses", "/agents", "/about", "/disclosure", "/contact"]
    .map((p) => `  <url><loc>${base}${p}</loc></url>`);
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

US bank account opening bonuses and credit card signup bonuses, verified by hand.
${stats.total_offers} live offers (${stats.bank_account_offers} bank accounts, ${stats.credit_card_offers} credit cards).
Total bonus value available: ${formatUsd(stats.total_bonus_usd)}. Last verification sweep: ${stats.last_verified ?? "unknown"}.
Every record carries source_url and last_verified_date. Card point values are estimated USD.

## Machine access (no API key, no signup)

- MCP (Streamable HTTP): POST ${ctx.publicUrl}/mcp
  Tools: search_bonuses (filters: bonus_type, state, min_bonus_amount_usd,
  direct_deposit_required, query, limit), get_bonus (id), expiring_soon (days),
  compare_bonuses (ids[2..4])
- MCP (local stdio): node dist/mcp-server.js  (see repo README)
- JSON feed: ${ctx.publicUrl}/api/bonuses.json
- One offer: ${ctx.publicUrl}/api/bonuses/:id
- Live stats: ${ctx.publicUrl}/api/stats
- Service descriptor: ${ctx.publicUrl}/api

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
last_verified_date.

## Usage notes

- Nationwide offers match any state filter; regional offers match only listed states.
- expiring_soon excludes offers with no stated end date.
- ${disclosureShort(affiliateActive(listAll()))}
- Human-readable disclosure: ${ctx.publicUrl}/disclosure
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
