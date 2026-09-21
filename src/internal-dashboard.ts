/**
 * Benefits City — internal metrics dashboard (Phase 2).
 *
 * NOT a public surface:
 *   · not linked from any page, not in sitemap.xml, not in llms.txt
 *   · carries <meta name="robots" content="noindex,nofollow">
 *   · reachable only through the METRICS_TOKEN guard in web-server.ts
 *
 * It shares the public stylesheet so it reads as a deliberate internal tool rather than a
 * scaffold, but it deliberately does NOT reuse the public shell(): that shell renders the
 * site nav and footer, which would make an internal page look and link like a public one.
 *
 * Every number is derived from the events table. Nothing here is mocked — an empty state
 * says "no data yet" instead of inventing a plausible chart.
 */
import type { DashboardData } from "./metrics.js";
import { bp, esc, SITE_NAME, type SiteContext } from "./site.js";

/** Window label for the dashboard's trailing metrics. Kept next to DASH_DAYS in metrics.ts. */
const WINDOW_LABEL = "14 days";

function num(n: number): string {
  return n.toLocaleString("en-US");
}

function bar(n: number, max: number): string {
  const pct = max <= 0 ? 0 : Math.max(1, Math.round((n / max) * 100));
  return `<div class="bar"><span style="width:${pct}%"></span></div>`;
}

function panel(title: string, hint: string, body: string): string {
  return `
  <section class="card" style="margin-bottom:22px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap">
      <h2 style="margin:0">${esc(title)}</h2>
      <span style="color:#7e8d84;font-size:13px">${esc(hint)}</span>
    </div>
    <div style="margin-top:14px">${body}</div>
  </section>`;
}

function bars(rows: { label: string; n: number }[], empty: string): string {
  if (rows.length === 0) return `<p style="color:#7e8d84;font-size:14px">${esc(empty)}</p>`;
  const max = Math.max(...rows.map((r) => r.n), 1);
  return rows
    .map(
      (r) => `<div style="display:grid;grid-template-columns:minmax(110px,36%) 1fr auto;gap:12px;align-items:center;padding:6px 0">
        <span style="font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.label)}</span>
        ${bar(r.n, max)}
        <span style="font-variant-numeric:tabular-nums;font-size:14px;color:#a7b5ac">${num(r.n)}</span>
      </div>`,
    )
    .join("");
}

function kpi(label: string, v: string, sub: string): string {
  return `<div style="flex:1 1 170px;padding:14px;border:1px solid #26312c;border-radius:10px">
    <div style="color:#7e8d84;font-size:12px;text-transform:uppercase;letter-spacing:.06em">${esc(label)}</div>
    <div style="font-size:26px;font-variant-numeric:tabular-nums;margin:4px 0">${esc(v)}</div>
    <div style="color:#7e8d84;font-size:12px">${esc(sub)}</div>
  </div>`;
}

/** Internal shell: same stylesheet, no public nav/footer, noindex. */
function internalShell(ctx: SiteContext, title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>${esc(title)} — ${esc(SITE_NAME)} (internal)</title>
<link rel="stylesheet" href="${bp(ctx, "/assets/site.css")}">
</head>
<body>
<main>${body}</main>
</body>
</html>`;
}

export function internalDashboard(ctx: SiteContext, d: DashboardData): string {
  const f = d.funnel;
  const stage = (label: string, n: number, prev?: number): string => {
    const rate =
      prev !== undefined && prev > 0 ? `${((n / prev) * 100).toFixed(1)}% of previous` : "";
    return `<div style="padding:10px 0;border-bottom:1px solid #26312c">
      <div style="display:flex;justify-content:space-between;gap:12px">
        <strong style="font-size:15px">${esc(label)}</strong>
        <span style="font-variant-numeric:tabular-nums">${num(n)} <span style="color:#7e8d84;font-size:13px">${esc(rate)}</span></span>
      </div>
    </div>`;
  };

  const anomalies =
    d.anomalies.length === 0
      ? `<p style="color:#7e8d84;font-size:14px">No anomalies detected in the trailing window.</p>`
      : d.anomalies
          .map(
            (a) =>
              `<p style="margin:6px 0;padding:10px 12px;border-left:3px solid #d9a441;background:#241f16;font-size:14px">⚠️ ${esc(a)}</p>`,
          )
          .join("");

  const mcpTotal = d.mcp_tools.reduce((a, b) => a + b.n, 0);
  const feedTotal = d.feeds.reduce((a, b) => a + b.n, 0);

  const body = `
  <div class="wrap">
    <div class="detail-head">
      <div class="crumb"><a href="${bp(ctx, "/")}">${esc(SITE_NAME)}</a> · internal</div>
      <h1>Metrics dashboard</h1>
      <p class="bankline">Internal — not linked publicly, noindex. Generated ${esc(d.generated_at)}</p>
    </div>

    <div style="display:flex;gap:12px;flex-wrap:wrap;margin:18px 0">
      ${kpi("Events stored", num(d.totals.events), "all time, all kinds")}
      ${kpi("Apply clicks", num(f.apply), `last ${WINDOW_LABEL}`)}
      ${kpi("MCP tool calls", num(mcpTotal), `last ${WINDOW_LABEL}`)}
      ${kpi("Feed hits", num(feedTotal), `llms.txt / json / api · last ${WINDOW_LABEL}`)}
    </div>

    ${panel(
      "Humans vs agents, per day",
      "page views (human) beside MCP calls + feed hits (agents)",
      `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px">
        <div>
          <div style="color:#7e8d84;font-size:13px;margin-bottom:8px">Human page views</div>
          ${bars(d.daily.map((r) => ({ label: r.day, n: r.visitors })), "no page views recorded yet")}
        </div>
        <div>
          <div style="color:#7e8d84;font-size:13px;margin-bottom:8px">Agent activity</div>
          ${bars(d.daily.map((r) => ({ label: r.day, n: r.agents })), "no agent activity recorded yet")}
        </div>
      </div>`,
    )}

    ${panel(
      "Funnel",
      "landing → browse → detail → Apply",
      stage("Landing", f.landing) +
        stage("Browse / filter", f.browse, f.landing) +
        stage("Offer detail", f.detail, f.browse) +
        stage("Apply click", f.apply, f.detail),
    )}

    ${panel(
      "Top offers by Apply clicks",
      "drives affiliate prioritisation",
      bars(
        d.offers.map((o) => ({ label: o.offer_id, n: o.clicks })),
        "no Apply clicks yet",
      ),
    )}

    ${panel(
      "Filter usage",
      "what people search for on /bonuses",
      bars(d.filters.map((r) => ({ label: r.query, n: r.n })), "no filters used yet"),
    )}

    ${panel(
      "MCP tool mix",
      "which agent tools are actually called",
      bars(d.mcp_tools.map((r) => ({ label: r.tool, n: r.n })), "no MCP calls yet"),
    )}

    ${panel(
      "Discovery feeds",
      "llms.txt hits are the leading indicator of agent discovery",
      bars(d.feeds.map((r) => ({ label: r.feed, n: r.n })), "no feed hits yet"),
    )}

    ${panel("Anomalies", "traffic spikes vs trailing baseline", anomalies)}

    <p style="color:#7e8d84;font-size:12px;margin-top:26px">
      DB: ${esc(d.db_path)} · privacy: no PII, no raw IPs, daily-rotated salts, DNT respected
    </p>
  </div>`;

  return internalShell(ctx, "Metrics dashboard", body);
}
