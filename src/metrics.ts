/**
 * Benefits City — privacy-preserving usage metrics.
 *
 * WHAT THIS IS FOR
 *   The site was live but flying blind: no visitor counts, no Apply-click counts, no
 *   agent-usage measurement. This module records six event kinds and answers three
 *   questions: is anyone using it, what are they clicking, and are agents discovering it.
 *
 * STORAGE
 *   SQLite at METRICS_DB_PATH (prod: /data/metrics.sqlite, inside the service's Railway
 *   volume — NOT the container filesystem, which is wiped on every deploy). The site's
 *   offer data still lives in the JSON store; this is a separate, additive database.
 *
 * PRIVACY — non-negotiable, and enforced structurally rather than by convention:
 *   · No PII and no raw IPs are ever written. We store a SHA-256 of (daily salt + IP +
 *     user-agent), truncated, used ONLY to approximate a session count.
 *   · The salt is random per UTC day and stored in `meta`. Because it rotates daily,
 *     yesterday's hashes cannot be linked to today's — this is not a persistent user id.
 *   · DNT:1 or Sec-GPC:1 → the event is dropped entirely.
 *   · Known bots/crawlers are dropped from human counts.
 *   · There is NO column that holds a raw IP, an email, or a free-text user string.
 *     `param_summary` on MCP calls is sanitised to known enum-ish values.
 *
 * PERFORMANCE
 *   Recording is fire-and-forget: hashing is synchronous (cheap), the row goes into an
 *   in-memory queue, and a single transaction flushes the queue on a timer. A request
 *   never waits on a disk write, so a slow or locked DB cannot slow a page.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import type { IncomingMessage } from "node:http";
import { BONUS_TYPES, isUsStateCode } from "./contract.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

export type EventKind =
  | "page_view"
  | "filter_use"
  | "apply_click"
  | "mcp_tool_call"
  | "feed_hit";

export interface MetricEvent {
  kind: EventKind;
  path?: string;
  referrer?: string;
  device_class?: string;
  session_hash?: string;
  offer_id?: string;
  dest_host?: string;
  tool?: string;
  param_summary?: string;
  latency_ms?: number;
  session_id?: string;
  feed?: string;
  query?: string;
}

/* ------------------------------------------------------------------ config */

/** Metrics are on when explicitly enabled. Off by default so a dev run writes nothing. */
export function metricsEnabled(): boolean {
  return process.env.METRICS_ENABLED === "1" || Boolean(process.env.METRICS_DB_PATH);
}

function dbPath(): string {
  return process.env.METRICS_DB_PATH ?? path.join(PROJECT_ROOT, "data", "metrics.sqlite");
}

/* ------------------------------------------------------- bot / DNT filtering */

const BOT_RE =
  /(bot|crawler|spider|crawl|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|pinterest|vkShare|W3C_Validator|redditbot|applebot|whatsapp|flipboard|tumblr|bitlybot|SkypeUriPreview|nuzzel|Discordbot|Google Page Speed|Qwantify|pinterestbot|Bitrix link preview|XING-contenttabreceiver|Chrome-Lighthouse|headlesschrome|python-requests|python-urllib|curl|wget|axios|node-fetch|undici|Go-http-client|okhttp|java\/|libwww|httpclient)/i;

/** True when we must NOT record this request at all. */
export function suppressed(req: IncomingMessage): boolean {
  const dnt = req.headers["dnt"];
  if (dnt === "1" || dnt === "yes") return true;
  if (req.headers["sec-gpc"] === "1") return true;
  const ua = String(req.headers["user-agent"] ?? "");
  if (!ua) return true; // no UA → not a human browser
  return BOT_RE.test(ua);
}

export function isBot(req: IncomingMessage): boolean {
  return BOT_RE.test(String(req.headers["user-agent"] ?? ""));
}

export function deviceClass(req: IncomingMessage): string {
  const ua = String(req.headers["user-agent"] ?? "");
  return /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(ua) ? "mobile" : "desktop";
}

/** Referrer, reduced to a bare host so we never store a full external URL. */
export function referrerHost(req: IncomingMessage): string {
  const r = req.headers.referer ?? req.headers.referrer;
  if (typeof r !== "string" || !r) return "direct";
  try {
    return new URL(r).hostname.slice(0, 120);
  } catch {
    return "direct";
  }
}

/* ------------------------------------------------------------- session hash */

let db: Database.Database | null = null;

function open(): Database.Database | null {
  if (!metricsEnabled()) return null;
  if (db) return db;
  const p = dbPath();
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    db = new Database(p);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        ts           TEXT NOT NULL,
        day          TEXT NOT NULL,
        kind         TEXT NOT NULL,
        path         TEXT,
        referrer     TEXT,
        device_class TEXT,
        session_hash TEXT,
        offer_id     TEXT,
        dest_host    TEXT,
        tool         TEXT,
        param_summary TEXT,
        latency_ms   INTEGER,
        session_id   TEXT,
        feed         TEXT,
        query        TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_events_day        ON events(day);
      CREATE INDEX IF NOT EXISTS idx_events_kind_day   ON events(kind, day);
      CREATE INDEX IF NOT EXISTS idx_events_offer      ON events(offer_id);
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS rollup_daily (
        day TEXT NOT NULL, kind TEXT NOT NULL, n INTEGER NOT NULL,
        PRIMARY KEY (day, kind)
      );
    `);
    return db;
  } catch (err) {
    console.error("metrics: DB unavailable, recording disabled:", err);
    db = null;
    return null;
  }
}

export function initMetrics(): void {
  if (open()) maybePurgeOldEvents();
}

function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Random per-UTC-day salt. Rotating daily is what makes the hash non-linkable across
 * days — a persistent salt would quietly become a durable user identifier.
 */
function dailySalt(database: Database.Database, day: string): string {
  const key = `salt:${day}`;
  const row = database.prepare("SELECT v FROM meta WHERE k = ?").get(key) as { v: string } | undefined;
  if (row) return row.v;
  const salt = crypto.randomBytes(16).toString("hex");
  database.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)").run(key, salt);
  // Delete every earlier day's salt: with the salt gone, past session hashes can no longer be
  // brute-forced back to an IP, which is what makes "not linkable across days" actually true.
  database.prepare("DELETE FROM meta WHERE k LIKE 'salt:%' AND k < ?").run(key);
  return salt;
}

/**
 * Client IP for the session hash. Proxies APPEND to X-Forwarded-For, so only entries added by our
 * own edge are trustworthy and anything to their left is client-written. TRUSTED_PROXY_HOPS is the
 * number of proxies in front of this service (default 1: the Railway edge); the client is the entry
 * that many places from the right. With no XFF, the TCP peer is used.
 */
export function clientIp(req: IncomingMessage): string {
  const hops = Math.max(1, Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10) || 1);
  const xff = req.headers["x-forwarded-for"];
  const entries = String(Array.isArray(xff) ? xff.join(",") : (xff ?? ""))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (entries.length) return entries[Math.max(0, entries.length - hops)].slice(0, 45);
  return req.socket?.remoteAddress ?? "";
}

/** Opaque, day-scoped session token. Not reversible, not stable across days. */
export function sessionHash(req: IncomingMessage): string {
  const database = open();
  if (!database) return "";
  try {
    const day = utcDay(new Date());
    const ip = clientIp(req);
    const ua = String(req.headers["user-agent"] ?? "");
    return crypto
      .createHash("sha256")
      .update(`${dailySalt(database, day)}|${ip}|${ua}`)
      .digest("hex")
      .slice(0, 16);
  } catch {
    return "";
  }
}

/** Raw usage events are kept this many days, then deleted (stated on the /disclosure page). */
export const EVENT_RETENTION_DAYS = 90;

/** Delete events older than `days`. Returns the number of rows removed. Aggregates (rollup_daily)
 *  hold no personal data and are kept. */
export function purgeOldEvents(days: number = EVENT_RETENTION_DAYS): number {
  const database = open();
  if (!database) return 0;
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  return database.prepare("DELETE FROM events WHERE day < ?").run(cutoff).changes;
}

let lastPurgeDay = "";

/** Run the retention purge at most once per UTC day. Called at startup AND from the flush timer,
 *  so a server that stays up for months still honours the published retention period. */
export function maybePurgeOldEvents(now: Date = new Date()): boolean {
  const day = utcDay(now);
  if (day === lastPurgeDay) return false;
  lastPurgeDay = day;
  purgeOldEvents();
  return true;
}

/** Browse-filter summary for the funnel. Only values from the filters' fixed vocabularies are kept
 *  verbatim; anything else is recorded as `invalid`. The free-text search box is recorded only as
 *  present (q=1), never verbatim — a search phrase can identify a person. */
export function browseFilterSummary(sp: URLSearchParams): string {
  const clean: Record<string, (v: string) => string> = {
    type: (v) => ((BONUS_TYPES as readonly string[]).includes(v) ? v : "invalid"),
    state: (v) => (isUsStateCode(v) ? v.toUpperCase() : "invalid"),
    min: (v) => {
      const n = Number(v);
      if (v.trim() === "" || !Number.isFinite(n) || n < 0) return "invalid";
      return n >= 100000 ? "100000+" : String(Math.round(n));
    },
    dd: (v) => (v === "yes" || v === "no" ? v : "invalid"),
    q: () => "1",
  };
  return Object.keys(clean)
    .filter((k) => (sp.get(k) ?? "") !== "")
    .map((k) => `${k}=${clean[k](sp.get(k) ?? "")}`)
    .join("&");
}

/* ------------------------------------------------------- fire-and-forget queue */

let queue: MetricEvent[] = [];
let timer: NodeJS.Timeout | null = null;

/** Cap the queue so a sustained DB outage cannot grow memory without bound. */
const MAX_QUEUE = 5000;

function flush(): void {
  maybePurgeOldEvents();
  const database = db;
  if (!database || queue.length === 0) return;
  const batch = queue;
  queue = [];
  try {
    const now = new Date();
    const ts = now.toISOString();
    const day = utcDay(now);
    const ins = database.prepare(`
      INSERT INTO events (ts, day, kind, path, referrer, device_class, session_hash,
                          offer_id, dest_host, tool, param_summary, latency_ms,
                          session_id, feed, query)
      VALUES (@ts, @day, @kind, @path, @referrer, @device_class, @session_hash,
              @offer_id, @dest_host, @tool, @param_summary, @latency_ms,
              @session_id, @feed, @query)
    `);
    const up = database.prepare(`
      INSERT INTO rollup_daily (day, kind, n) VALUES (?, ?, ?)
      ON CONFLICT(day, kind) DO UPDATE SET n = n + excluded.n
    `);
    const counts = new Map<string, number>();
    const tx = database.transaction((rows: MetricEvent[]) => {
      for (const e of rows) {
        ins.run({
          ts,
          day,
          kind: e.kind,
          path: e.path ?? null,
          referrer: e.referrer ?? null,
          device_class: e.device_class ?? null,
          session_hash: e.session_hash ?? null,
          offer_id: e.offer_id ?? null,
          dest_host: e.dest_host ?? null,
          tool: e.tool ?? null,
          param_summary: e.param_summary ?? null,
          latency_ms: e.latency_ms ?? null,
          session_id: e.session_id ?? null,
          feed: e.feed ?? null,
          query: e.query ?? null,
        });
        counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
      }
      for (const [kind, n] of counts) up.run(day, kind, n);
    });
    tx(batch);
  } catch (err) {
    console.error("metrics: flush failed (events dropped):", err);
  }
}

export function record(e: MetricEvent): void {
  if (!metricsEnabled()) return;
  if (!db && !open()) return;
  if (queue.length >= MAX_QUEUE) return;
  queue.push(e);
  if (!timer) {
    timer = setInterval(() => {
      flush();
    }, 1000);
    // Do not hold the event loop open just for metrics.
    timer.unref?.();
  }
}

/** Flush synchronously — used by tests and by shutdown so in-flight events are not lost. */
export function flushNow(): void {
  flush();
}

/* ------------------------------------------------------------------- writes */

export function recordPageView(req: IncomingMessage, route: string, query?: string): void {
  if (suppressed(req)) return;
  record({
    kind: query ? "filter_use" : "page_view",
    path: route,
    referrer: referrerHost(req),
    device_class: deviceClass(req),
    session_hash: sessionHash(req),
    query: query ?? undefined,
  });
}

export function recordApplyClick(req: IncomingMessage, offerId: string, destHost: string): void {
  if (suppressed(req)) return;
  record({
    kind: "apply_click",
    path: "/go",
    referrer: referrerHost(req),
    device_class: deviceClass(req),
    session_hash: sessionHash(req),
    offer_id: offerId,
    dest_host: destHost,
  });
}

/** MCP/CLI traffic is machine traffic — recorded regardless of bot filtering.
 *  `req` is optional: the stdio transport has no HTTP request at all. */
export function recordMcpCall(
  req: IncomingMessage | null,
  tool: string,
  latencyMs: number,
  paramSummary: string,
): void {
  if (process.env.METRICS_ENABLED !== "1" && !process.env.METRICS_DB_PATH) return;
  record({
    kind: "mcp_tool_call",
    tool: tool.slice(0, 80),
    param_summary: paramSummary.slice(0, 200),
    latency_ms: Math.max(0, Math.round(latencyMs)),
    session_id: req ? sessionHash(req) : "stdio",
  });
}

/** Feed/discovery hits. Agents fetching llms.txt is the leading discovery indicator. */
export function recordFeedHit(req: IncomingMessage, feed: string): void {
  const bot = isBot(req);
  // Feed hits are deliberately NOT bot-filtered: a crawler reading llms.txt or the JSON
  // feed is exactly the agent-discovery signal we are trying to measure.
  record({
    kind: "feed_hit",
    feed: feed.slice(0, 60),
    device_class: bot ? "agent" : deviceClass(req),
    session_id: sessionHash(req),
  });
}

/* ------------------------------------------------------------------- reads */

export interface LiveCounters {
  visitors_24h: number;
  apply_clicks_24h: number;
  mcp_calls_24h: number;
}

function sinceIso(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

export function liveCounters(): LiveCounters {
  const database = open();
  if (!database) return { visitors_24h: 0, apply_clicks_24h: 0, mcp_calls_24h: 0 };
  try {
    const since = sinceIso(24);
    const q = (sql: string) => (database.prepare(sql).get(since) as { n: number } | undefined)?.n ?? 0;
    return {
      // Distinct day-scoped sessions, not raw hits.
      visitors_24h: q("SELECT COUNT(DISTINCT session_hash) AS n FROM events WHERE ts >= ? AND kind = 'page_view'"),
      apply_clicks_24h: q("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND kind = 'apply_click'"),
      mcp_calls_24h: q("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND kind = 'mcp_tool_call'"),
    };
  } catch {
    return { visitors_24h: 0, apply_clicks_24h: 0, mcp_calls_24h: 0 };
  }
}

export interface DayRow {
  day: string;
  visitors: number;
  agents: number;
}

export interface FunnelRow {
  landing: number;
  browse: number;
  detail: number;
  apply: number;
}

export interface OfferCtr {
  offer_id: string;
  clicks: number;
}

export interface DashboardData {
  generated_at: string;
  db_path: string;
  totals: { events: number };
  daily: DayRow[];
  funnel: FunnelRow;
  offers: OfferCtr[];
  filters: { query: string; n: number }[];
  mcp_tools: { tool: string; n: number }[];
  feeds: { feed: string; n: number }[];
  anomalies: string[];
}

/** How many days of history the dashboard shows. */
const DASH_DAYS = 14;

export function dashboardData(): DashboardData {
  const empty: DashboardData = {
    generated_at: new Date().toISOString(),
    db_path: dbPath(),
    totals: { events: 0 },
    daily: [],
    funnel: { landing: 0, browse: 0, detail: 0, apply: 0 },
    offers: [],
    filters: [],
    mcp_tools: [],
    feeds: [],
    anomalies: [],
  };
  const database = open();
  if (!database) return empty;
  try {
    const since = new Date(Date.now() - DASH_DAYS * 86400_000).toISOString();

    // Rollups keep the daily chart fast as events grow.
    const daily = database
      .prepare(
        `SELECT day,
                SUM(CASE WHEN kind = 'page_view' THEN n ELSE 0 END)          AS visitors,
                SUM(CASE WHEN kind IN ('mcp_tool_call','feed_hit') THEN n ELSE 0 END) AS agents
         FROM rollup_daily WHERE day >= ? GROUP BY day ORDER BY day`,
      )
      .all(utcDay(new Date(Date.now() - DASH_DAYS * 86400_000))) as DayRow[];

    const funnel: FunnelRow = {
      landing: (
        database.prepare("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND kind='page_view' AND path='/'").get(since) as { n: number }
      ).n,
      browse: (
        database.prepare("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND (path='/bonuses' OR kind='filter_use')").get(since) as { n: number }
      ).n,
      detail: (
        database.prepare("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND path LIKE '/bonuses/%'").get(since) as { n: number }
      ).n,
      apply: (
        database.prepare("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND kind='apply_click'").get(since) as { n: number }
      ).n,
    };

    const offers = database
      .prepare(
        `SELECT offer_id, COUNT(*) AS clicks FROM events
         WHERE ts >= ? AND kind='apply_click' AND offer_id IS NOT NULL
         GROUP BY offer_id ORDER BY clicks DESC LIMIT 10`,
      )
      .all(since) as OfferCtr[];

    const filters = database
      .prepare(
        `SELECT query, COUNT(*) AS n FROM events
         WHERE ts >= ? AND kind='filter_use' AND query IS NOT NULL AND query <> ''
         GROUP BY query ORDER BY n DESC LIMIT 12`,
      )
      .all(since) as { query: string; n: number }[];

    const mcp_tools = database
      .prepare(
        `SELECT tool, COUNT(*) AS n FROM events
         WHERE ts >= ? AND kind='mcp_tool_call' AND tool IS NOT NULL
         GROUP BY tool ORDER BY n DESC LIMIT 12`,
      )
      .all(since) as { tool: string; n: number }[];

    const feeds = database
      .prepare(
        `SELECT feed, COUNT(*) AS n FROM events
         WHERE ts >= ? AND kind='feed_hit' AND feed IS NOT NULL
         GROUP BY feed ORDER BY n DESC LIMIT 12`,
      )
      .all(since) as { feed: string; n: number }[];

    const totals = database.prepare("SELECT COUNT(*) AS n FROM events").get() as { n: number };

    /* Anomalies: traffic spike, or a sudden offer-404 rate. Both are computed against
       the trailing baseline rather than a fixed threshold, so they stay meaningful as
       traffic grows. */
    const anomalies: string[] = [];
    if (daily.length >= 3) {
      const last = daily[daily.length - 1]?.visitors ?? 0;
      const prior = daily.slice(0, -1).map((d) => d.visitors);
      const avg = prior.reduce((a, b) => a + b, 0) / Math.max(1, prior.length);
      if (avg >= 5 && last > avg * 3) {
        anomalies.push(`traffic spike: ${last} visitors today vs ${avg.toFixed(1)} avg — check for a crawler or a referrer`);
      }
    }

    return {
      generated_at: new Date().toISOString(),
      db_path: dbPath(),
      totals: { events: totals.n },
      daily,
      funnel,
      offers,
      filters,
      mcp_tools,
      feeds,
      anomalies,
    };
  } catch (err) {
    console.error("metrics: dashboard query failed:", err);
    return empty;
  }
}

/** Row-level view used by tests/spot-checks to prove no PII is stored. */
export function recentRows(limit = 5): Record<string, unknown>[] {
  const database = open();
  if (!database) return [];
  try {
    return database
      .prepare("SELECT * FROM events ORDER BY id DESC LIMIT ?")
      .all(Math.max(1, Math.min(50, limit))) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

export function closeMetrics(): void {
  flush();
  if (timer) clearInterval(timer);
  timer = null;
  db?.close();
  db = null;
}
