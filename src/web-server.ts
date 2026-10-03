#!/usr/bin/env node
/**
 * Benefits City — hybrid web + agent server.
 *
 * Human site (server-rendered) + machine layer:
 *
 *   GET /                    landing (live stats from the real data)
 *   GET /bonuses             browse: ?type=&state=&min=&dd=&q=&sort=
 *   GET /bonuses/:id         bonus detail
 *   GET /agents              agent docs: MCP endpoint, tools, feeds, CLI
 *   GET /about               about + methodology
 *   GET /disclosure          FTC affiliate disclosure
 *   GET /contact             contact
 *   GET /healthz             health check for uptime monitors / Railway
 *   GET /llms.txt            dynamic agent manifest (host-aware)
 *   GET /api                 service descriptor
 *   GET /api/stats           live counts, total bonus value, expiring list
 *   GET /api/bonuses.json    full bonus feed
 *   GET /api/bonuses/:id     single bonus or typed 404
 *   GET /api/search          search (same filters as the MCP search_bonuses tool)
 *   GET /api/expiring        offers expiring within ?days=
 *   GET /api/compare         ?ids=a,b[,c,d] side-by-side
 *   POST|GET|DELETE /mcp     MCP over Streamable HTTP (stateless, no auth)
 *   GET /assets/*            static assets
 *
 * The whole app can live under a subpath (e.g. aiagentscity.com/benefits via
 * reverse proxy). Set BASE_PATH=/benefits and every internal link, asset path,
 * and form action follows automatically.
 *
 * Run:  npm run web        (PORT env, default 3000)
 * Env:  PORT, BASE_PATH ("" default), PUBLIC_URL (optional canonical URL),
 *       BONUS_DB_PATH (optional override of data/bonuses.json),
 *       TRUSTED_PROXY_HOPS (proxy count for client IP, default 1),
 *       RATE_LIMIT_PER_MIN (per-visitor cap, 0 = off — set with TRUSTED_PROXY_HOPS)
 */
import { timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getBonusById, listAll } from "./db.js";
import { resolveApplyUrl, toPublic } from "./links.js";
import { changelog, changelogAtom, changelogJson } from "./changelog.js";
import { badgeSvg } from "./badge.js";
import { checkRange } from "./checks.js";
import { INDEXNOW_KEY } from "./indexnow.js";
import { insights } from "./insights.js";
import { openapiJson } from "./openapi.js";
import { banksIndexPage, bestPage, expiringPage, issuerPage, statePage, statesIndexPage } from "./seo-pages.js";
import { restById, restCompare, restExpiring, restSearch, type RestResult } from "./rest.js";
import { API_VERSION, SERVER_VERSION, agentJson, aiPluginManifest, authMd, pricingMd, serverCard, serverJson } from "./meta.js";
import { createMcpServer, describeMcpTools } from "./mcp-tools.js";
import {
  clientIp,
  closeMetrics,
  dashboardData,
  initMetrics,
  browseFilterSummary,
  recordApplyClick,
  recordFeedHit,
  recordPageView,
} from "./metrics.js";
import { RateLimiter, configuredLimit } from "./rate-limit.js";
import { internalDashboard } from "./internal-dashboard.js";
import { getStats } from "./stats.js";
import {
  aboutPage,
  agentsPage,
  bp,
  browsePage,
  changelogPage,
  contactPage,
  detailPage,
  disclosurePage,
  landingPage,
  llmsText,
  notFoundPage,
  okfIndexMd,
  privacyPage,
  robotsText,
  sitemapText,
  termsPage,
  type BrowseQuery,
  type SiteContext,
} from "./site.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT ?? 3000);
/** Mount point, e.g. "/benefits". Empty string = root. No trailing slash. */
const BASE_PATH = (process.env.BASE_PATH ?? "").replace(/\/+$/, "");

function send(
  res: http.ServerResponse,
  status: number,
  contentType: string,
  body: string | Buffer,
): void {
  res.writeHead(status, {
    "content-type": contentType,
    "access-control-allow-origin": "*",
    "x-api-version": API_VERSION,
    "cache-control": status === 200 ? "public, max-age=300" : "no-store",
  });
  res.end(body);
}

function publicUrlFor(req: http.IncomingMessage): string {
  const fromEnv = (process.env.PUBLIC_URL ?? "").replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const host = req.headers.host ?? `localhost:${PORT}`;
  const forwarded = req.headers["x-forwarded-proto"];
  const proto =
    typeof forwarded === "string" && forwarded
      ? forwarded.split(",")[0].trim()
      : host.startsWith("localhost") || host.startsWith("127.")
        ? "http"
        : "https";
  return `${proto}://${host}${BASE_PATH}`;
}

function ctxFor(req: http.IncomingMessage): SiteContext {
  return { basePath: BASE_PATH, publicUrl: publicUrlFor(req) };
}

/* Per-visitor rate limit — null unless RATE_LIMIT_PER_MIN > 0. Enable together
 * with TRUSTED_PROXY_HOPS (RAILWAY_DEPLOY.md): keys come from clientIp(), so
 * with the wrong hop count all proxied visitors share one bucket. */
const rateLimiter = configuredLimit() > 0 ? new RateLimiter(configuredLimit()) : null;

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function serveAsset(pathname: string, res: http.ServerResponse): boolean {
  // Only serve files under public/assets (no directory traversal).
  const rel = pathname.slice("/assets/".length);
  if (!rel || rel.includes("..") || rel.includes("\\")) return false;
  const file = path.join(PUBLIC, "assets", rel);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  const ct = CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  return send(res, 200, ct, fs.readFileSync(file)), true;
}

/* ---- MCP over Streamable HTTP (stateless) ----
 * The SDK's stateless pattern: one fresh McpServer + transport per request.
 * Tool definitions come from createMcpServer() so the contract matches stdio. */
async function handleMcp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("Error handling MCP request:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        }),
      );
    }
  } finally {
    res.on("close", () => {
      void transport.close().catch(() => undefined);
      void server.close().catch(() => undefined);
    });
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "access-control-allow-origin": "*" });
    res.end();
    return;
  }
  void (async () => {
    try {
      const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
      let pathname = url.pathname;

      // Enforce the mount point: when BASE_PATH is set, only serve under it.
      if (BASE_PATH) {
        if (pathname === BASE_PATH) {
          res.writeHead(302, { location: `${BASE_PATH}/` });
          res.end();
          return;
        }
        if (!pathname.startsWith(`${BASE_PATH}/`)) {
          return send(res, 404, "text/plain; charset=utf-8", "not found");
        }
        pathname = pathname.slice(BASE_PATH.length) || "/";
      }

      // One canonical URL per page: /bonuses/ -> /bonuses (query preserved).
      if (pathname.length > 1 && pathname.endsWith("/") && (req.method === "GET" || req.method === "HEAD")) {
        res.writeHead(301, { location: `${BASE_PATH}${pathname.replace(/\/+$/, "") || "/"}${url.search}` });
        res.end();
        return;
      }

      const ctx = ctxFor(req);

      /* Health check — for Railway / uptime monitors. No data beyond counts. */
      if (pathname === "/healthz")
        return send(
          res,
          200,
          "application/json; charset=utf-8",
          JSON.stringify({
            status: "ok",
            service: "benefits-city",
            offers: listAll().length,
            time: new Date().toISOString(),
          }),
        );

      /* Per-visitor rate limit. /healthz stays exempt above so uptime monitors
         and Railway health checks can never be throttled out. */
      if (rateLimiter) {
        const verdict = rateLimiter.check(clientIp(req) || "unknown");
        if (!verdict.allowed) {
          res.writeHead(429, {
            "content-type": "text/plain; charset=utf-8",
            "retry-after": String(verdict.retryAfterSeconds),
            "cache-control": "no-store",
            "x-api-version": API_VERSION,
          });
          res.end("rate limit exceeded");
          return;
        }
      }

      /* MCP — Streamable HTTP (stateless; POST only) */
      if (pathname === "/mcp") {
        if (req.method === "POST") {
          await handleMcp(req, res);
          return;
        }
        res.writeHead(405, { allow: "POST", "x-api-version": API_VERSION });
        res.end();
        return;
      }

      /* Apply-click choke point.
       * Every human Apply button points here; we count the click, then 302 to the bank's
       * official offer page. This is also the single future injection point for affiliate
       * tags — one change here instead of 29 in the data.
       * Handled before the GET/HEAD guard so HEAD works as well as GET. */
      const goMatch = pathname.match(/^\/go\/([A-Za-z0-9_-]+)$/);
      if (goMatch && (req.method === "GET" || req.method === "HEAD")) {
        const offer = getBonusById(goMatch[1]);
        if (!offer) return send(res, 404, "text/html; charset=utf-8", notFoundPage(ctx));
        const dest = resolveApplyUrl(offer);
        if (!dest) return send(res, 404, "text/html; charset=utf-8", notFoundPage(ctx));
        let destHost = "";
        try {
          destHost = new URL(dest).hostname;
        } catch {
          return send(res, 404, "text/html; charset=utf-8", notFoundPage(ctx));
        }
        // HEAD is a link checker / unfurler / prefetcher, not a person clicking Apply.
        if (req.method === "GET") recordApplyClick(req, offer.id, destHost);
        // 302 so the hop is not cached; no-store so a repeat click still counts.
        res.writeHead(302, {
          location: dest,
          "cache-control": "no-store",
          // Directives travel with the redirect so a crawler treats the destination the
          // same way it would have treated the direct link.
          "x-robots-tag": "noindex",
          "x-api-version": API_VERSION,
        });
        return res.end();
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        return send(res, 405, "text/plain; charset=utf-8", "method not allowed");
      }

      /* Human pages */
      if (pathname === "/") {
        recordPageView(req, "/");
        return send(res, 200, "text/html; charset=utf-8", landingPage(ctx));
      }
      if (pathname === "/agents") return send(res, 200, "text/html; charset=utf-8", agentsPage(ctx));
      if (pathname === "/about") return send(res, 200, "text/html; charset=utf-8", aboutPage(ctx));
      if (pathname === "/privacy")
        return send(res, 200, "text/html; charset=utf-8", privacyPage(ctx));
      if (pathname === "/terms") return send(res, 200, "text/html; charset=utf-8", termsPage(ctx));
      if (pathname === "/disclosure")
        return send(res, 200, "text/html; charset=utf-8", disclosurePage(ctx));
      if (pathname === "/contact") return send(res, 200, "text/html; charset=utf-8", contactPage(ctx));

      /* Internal metrics dashboard — NOT public.
       * Not linked from any page, not in sitemap.xml, not in llms.txt, and it carries
       * noindex. Gated by METRICS_TOKEN. When the token is unset we 404 rather than 401,
       * so an unconfigured deploy does not advertise that the route exists. */
      if (pathname === "/internal") {
        const token = process.env.METRICS_TOKEN;
        if (!token) return send(res, 404, "text/html; charset=utf-8", notFoundPage(ctx));
        const auth = String(req.headers.authorization ?? "");
        const supplied = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        const ok =
          supplied.length === token.length &&
          timingSafeEqual(Buffer.from(supplied), Buffer.from(token));
        if (!ok) {
          res.writeHead(401, {
            "content-type": "text/plain; charset=utf-8",
            "www-authenticate": 'Bearer realm="internal"',
            "cache-control": "no-store",
          });
          return res.end("unauthorized");
        }
        return send(res, 200, "text/html; charset=utf-8", internalDashboard(ctx, dashboardData()));
      }

      if (pathname === "/bonuses") {
        const q: BrowseQuery = {
          type: url.searchParams.get("type") ?? "",
          state: url.searchParams.get("state") ?? "",
          min: url.searchParams.get("min") ?? "",
          dd: url.searchParams.get("dd") ?? "",
          q: url.searchParams.get("q") ?? "",
          sort: url.searchParams.get("sort") === "expiry" ? "expiry" : "value",
        };
        // A filtered browse is recorded as filter_use (enumerated filters only; the free-text
        // search box is recorded as present, never verbatim); a plain browse is a page_view.
        const filterStr = browseFilterSummary(url.searchParams);
        recordPageView(req, "/bonuses", filterStr || undefined);
        return send(res, 200, "text/html; charset=utf-8", browsePage(ctx, q));
      }
      const detailMatch = pathname.match(/^\/bonuses\/([A-Za-z0-9_-]+)$/);
      if (detailMatch) {
        const html = detailPage(ctx, detailMatch[1]);
        if (!html) return send(res, 404, "text/html; charset=utf-8", notFoundPage(ctx));
        // The path carries the offer id, which is what the funnel's detail stage counts.
        recordPageView(req, `/bonuses/${detailMatch[1]}`);
        return send(res, 200, "text/html; charset=utf-8", html);
      }

      /* Agent manifest */
      if (pathname === "/llms.txt") {
        recordFeedHit(req, "llms.txt");
        return send(res, 200, "text/plain; charset=utf-8", llmsText(ctx));
      }

      /* Crawler surfaces. Both are built from PUBLIC_URL rather than the request host so
         the Railway origin cannot advertise itself as the canonical host for content that
         is also served under /benefits. */
      if (pathname === "/robots.txt")
        return send(res, 200, "text/plain; charset=utf-8", robotsText(ctx));

      if (pathname === "/sitemap.xml")
        return send(res, 200, "application/xml; charset=utf-8", sitemapText(ctx));

      /* Agent discovery: MCP registry manifest (also at the well-known path) and credential doc. */
      if (pathname === "/server.json" || pathname === "/.well-known/mcp.json")
        return send(res, 200, "application/json; charset=utf-8", JSON.stringify(serverJson(ctx.publicUrl), null, 2));
      if (pathname === "/auth.md")
        return send(res, 200, "text/markdown; charset=utf-8", authMd(ctx.publicUrl));
      if (pathname === "/pricing.md")
        return send(res, 200, "text/markdown; charset=utf-8", pricingMd(ctx.publicUrl));
      /* OKF agent-readable index — a map to the machine surfaces, not a page clone. */
      if (pathname === "/okf" || pathname === "/okf/" || pathname === "/okf/index.md")
        return send(res, 200, "text/markdown; charset=utf-8", okfIndexMd(ctx));
      if (pathname === "/skill.md")
        return send(res, 200, "text/markdown; charset=utf-8", fs.readFileSync(path.join(ROOT, "skill", "benefits-city", "SKILL.md")));
      if (pathname === "/docs") return send(res, 200, "text/html; charset=utf-8", agentsPage(ctx));
      /* Programmatic SEO pages — each returns null (real 404) unless it has real offers. */
      {
        const seoHtml = (html: string | null) =>
          html ? send(res, 200, "text/html; charset=utf-8", html) : send(res, 404, "text/html; charset=utf-8", notFoundPage(ctx));
        if (pathname === "/banks") return seoHtml(banksIndexPage(ctx));
        if (pathname === "/states") return seoHtml(statesIndexPage(ctx));
        if (pathname === "/expiring-soon") return seoHtml(expiringPage(ctx));
        const m = pathname.match(/^\/(banks|states|best)\/([A-Za-z0-9-]+)$/);
        if (m) {
          const html = m[1] === "banks" ? issuerPage(ctx, m[2]) : m[1] === "states" ? statePage(ctx, m[2]) : bestPage(ctx, m[2]);
          return seoHtml(html);
        }
      }
      if (pathname === "/changelog") return send(res, 200, "text/html; charset=utf-8", changelogPage(ctx, changelog()));
      if (pathname === "/changelog.json")
        return send(res, 200, "application/json; charset=utf-8", JSON.stringify(changelogJson(ctx.publicUrl, changelog()), null, 2));
      if (pathname === "/feed.xml")
        return send(res, 200, "application/atom+xml; charset=utf-8", changelogAtom(ctx.publicUrl, changelog()));
      if (pathname === "/.well-known/ai-plugin-manifest.json")
        return send(res, 200, "application/json; charset=utf-8", JSON.stringify(aiPluginManifest(ctx.publicUrl), null, 2));
      if (pathname === `/${INDEXNOW_KEY}.txt`) return send(res, 200, "text/plain; charset=utf-8", INDEXNOW_KEY);
      if (pathname === "/badge.svg") {
        const all = listAll();
        res.writeHead(200, {
          "content-type": "image/svg+xml; charset=utf-8",
          "access-control-allow-origin": "*",
          "cache-control": "public, max-age=3600",
          "x-api-version": API_VERSION,
        });
        return res.end(badgeSvg(all.length, checkRange(all).newest));
      }
      if (pathname === "/api/insights") {
        recordFeedHit(req, "api/insights");
        return send(res, 200, "application/json; charset=utf-8", JSON.stringify(insights(listAll(), ctx.publicUrl), null, 2));
      }
      if (pathname === "/openapi.json")
        return send(res, 200, "application/json; charset=utf-8", JSON.stringify(openapiJson(ctx.publicUrl), null, 2));
      if (pathname === "/.well-known/agent.json")
        return send(res, 200, "application/json; charset=utf-8", JSON.stringify(agentJson(ctx.publicUrl), null, 2));
      if (pathname === "/.well-known/mcp/server-card.json")
        return send(res, 200, "application/json; charset=utf-8", JSON.stringify(serverCard(ctx.publicUrl, await describeMcpTools()), null, 2));

      /* OpenAI plugin domain verification.
       * The submission portal issues a token and requires it served verbatim (and ONLY it — no JSON,
       * no list) at /.well-known/openai-apps-challenge on the MCP host or a parent origin.
       * We deliberately serve nothing until the operator sets the env var: a placeholder here would
       * be a false claim of verified ownership. */
      if (pathname === "/.well-known/openai-apps-challenge") {
        const token = (process.env.OPENAI_APPS_CHALLENGE_TOKEN ?? "").trim();
        if (!token) return send(res, 404, "text/plain; charset=utf-8", "not configured\n");
        return send(res, 200, "text/plain; charset=utf-8", token);
      }

      /* JSON APIs */
      if (pathname === "/api") {
        return send(
          res,
          200,
          "application/json; charset=utf-8",
          JSON.stringify(
            {
              name: "benefits-city",
              version: SERVER_VERSION,
              description:
                "US bank account opening bonuses and credit card signup bonuses — human site + agent-native feed. An AI Agent City project.",
              site: {
                landing: bp(ctx, "/"),
                browse: bp(ctx, "/bonuses"),
                bonus_detail: bp(ctx, "/bonuses/:id"),
                agent_docs: bp(ctx, "/agents"),
              },
              endpoints: {
                llms_txt: bp(ctx, "/llms.txt"),
                service_descriptor: bp(ctx, "/api"),
                server_json: bp(ctx, "/server.json"),
                auth_md: bp(ctx, "/auth.md"),
                stats: bp(ctx, "/api/stats"),
                bonuses_feed: bp(ctx, "/api/bonuses.json"),
                bonus_by_id: bp(ctx, "/api/bonuses/:id"),
                search: bp(ctx, "/api/search"),
                expiring: bp(ctx, "/api/expiring"),
                compare: bp(ctx, "/api/compare"),
              },
              mcp: {
                transports: ["streamable-http", "stdio"],
                http_endpoint: `${ctx.publicUrl}/mcp`,
                stdio_command: "node dist/mcp-server.js (after npm run build)",
                tools: ["search_bonuses", "get_bonus", "expiring_soon", "compare_bonuses", "benefits_api_docs", "benefits_examples"],
              },
              cli: "npm run cli -- <search|get|expiring|compare> [flags]  (JSON on stdout)",
            },
            null,
            2,
          ),
        );
      }
      if (pathname === "/api/stats") {
        recordFeedHit(req, "api/stats");
        return send(res, 200, "application/json; charset=utf-8", JSON.stringify(getStats(), null, 2));
      }
      if (pathname === "/api/bonuses.json") {
        recordFeedHit(req, "api/bonuses.json");
        return send(res, 200, "application/json; charset=utf-8", JSON.stringify(listAll().map(toPublic), null, 2));
      }
      /* REST parity with the MCP tools — same data, same public shaping, typed errors. */
      const restRoutes: Record<string, (sp: URLSearchParams) => RestResult> = {
        "/api/search": restSearch,
        "/api/expiring": restExpiring,
        "/api/compare": restCompare,
      };
      if (restRoutes[pathname]) {
        recordFeedHit(req, pathname.slice(1));
        const r = restRoutes[pathname](url.searchParams);
        return send(res, r.status, "application/json; charset=utf-8", JSON.stringify(r.body, null, 2));
      }
      const apiMatch = pathname.match(/^\/api\/bonuses\/([A-Za-z0-9_-]+)$/);
      if (apiMatch) {
        const r = restById(apiMatch[1]);
        return send(res, r.status, "application/json; charset=utf-8", JSON.stringify(r.body, null, 2));
      }

      /* Static assets */
      if (pathname.startsWith("/assets/")) {
        if (serveAsset(pathname, res)) return;
        return send(res, 404, "text/plain; charset=utf-8", "not found");
      }

      return send(res, 404, "text/html; charset=utf-8", notFoundPage(ctx));
    } catch (err) {
      console.error(err);
      if (!res.headersSent) return send(res, 500, "text/plain; charset=utf-8", "internal server error");
      res.end();
    }
  })();
});

initMetrics();

/* Flush queued events on shutdown so a deploy does not silently drop the tail. */
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    closeMetrics();
    process.exit(0);
  });
}

server.listen(PORT, () => {
  console.log(`benefits-city listening on http://localhost:${PORT}${BASE_PATH || ""}`);
  console.log(`  site:  http://localhost:${PORT}${BASE_PATH || ""}/`);
  console.log(`  mcp:   http://localhost:${PORT}${BASE_PATH || ""}/mcp`);
  console.log(`  feed:  http://localhost:${PORT}${BASE_PATH || ""}/api/bonuses.json`);
  console.log(`  llms:  http://localhost:${PORT}${BASE_PATH || ""}/llms.txt`);
});
