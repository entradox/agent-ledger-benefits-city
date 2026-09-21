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
 *   GET /api/bonuses/:id     single bonus or 404
 *   POST|GET|DELETE /mcp     MCP over Streamable HTTP (stateless, no auth)
 *   GET /assets/*            static assets
 *
 * The whole app can live under a subpath (e.g. aiagentscity.com/benefits via
 * reverse proxy). Set BASE_PATH=/benefits and every internal link, asset path,
 * and form action follows automatically.
 *
 * Run:  npm run web        (PORT env, default 3000)
 * Env:  PORT, BASE_PATH ("" default), PUBLIC_URL (optional canonical URL),
 *       BONUS_DB_PATH (optional override of data/bonuses.json)
 */
import { timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { getBonusById, listAll } from "./db.js";
import { createMcpServer } from "./mcp-tools.js";
import {
  closeMetrics,
  dashboardData,
  initMetrics,
  recordApplyClick,
  recordFeedHit,
  recordPageView,
} from "./metrics.js";
import { internalDashboard } from "./internal-dashboard.js";
import { getStats } from "./stats.js";
import {
  aboutPage,
  agentsPage,
  bp,
  browsePage,
  contactPage,
  detailPage,
  disclosurePage,
  landingPage,
  llmsText,
  notFoundPage,
  robotsText,
  sitemapText,
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

      /* MCP — Streamable HTTP (stateless; POST only) */
      if (pathname === "/mcp") {
        if (req.method === "POST") {
          await handleMcp(req, res);
          return;
        }
        res.writeHead(405, { allow: "POST" });
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
        const dest = offer.application_url || offer.source_url;
        if (!dest) return send(res, 404, "text/html; charset=utf-8", notFoundPage(ctx));
        let destHost = "";
        try {
          destHost = new URL(dest).hostname;
        } catch {
          return send(res, 404, "text/html; charset=utf-8", notFoundPage(ctx));
        }
        recordApplyClick(req, offer.id, destHost);
        // 302 so the hop is not cached; no-store so a repeat click still counts.
        res.writeHead(302, {
          location: dest,
          "cache-control": "no-store",
          // Directives travel with the redirect so a crawler treats the destination the
          // same way it would have treated the direct link.
          "x-robots-tag": "noindex",
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
        // A filtered browse is recorded as filter_use (with the filter string, not the
        // free-text search box content verbatim beyond its own param); a plain browse is
        // a page_view.
        const filterStr = ["type", "state", "min", "dd", "q", "sort"]
          .filter((k) => k !== "sort" && (url.searchParams.get(k) ?? "") !== "")
          .map((k) => `${k}=${(url.searchParams.get(k) ?? "").slice(0, 40)}`)
          .join("&");
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

      /* JSON APIs */
      if (pathname === "/api") {
        return send(
          res,
          200,
          "application/json; charset=utf-8",
          JSON.stringify(
            {
              name: "benefits-city",
              version: "0.2.0",
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
                stats: bp(ctx, "/api/stats"),
                bonuses_feed: bp(ctx, "/api/bonuses.json"),
                bonus_by_id: bp(ctx, "/api/bonuses/:id"),
              },
              mcp: {
                transports: ["streamable-http", "stdio"],
                http_endpoint: `${ctx.publicUrl}/mcp`,
                stdio_command: "node dist/mcp-server.js (after npm run build)",
                tools: ["search_bonuses", "get_bonus", "expiring_soon", "compare_bonuses"],
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
        return send(res, 200, "application/json; charset=utf-8", JSON.stringify(listAll(), null, 2));
      }
      const apiMatch = pathname.match(/^\/api\/bonuses\/([A-Za-z0-9_-]+)$/);
      if (apiMatch) {
        const bonus = getBonusById(apiMatch[1]);
        if (!bonus)
          return send(res, 404, "application/json; charset=utf-8", JSON.stringify({ error: "bonus not found" }));
        return send(res, 200, "application/json; charset=utf-8", JSON.stringify(bonus, null, 2));
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
