#!/usr/bin/env node
/**
 * Daily freshness check. Reads the served store, fetches each record's source page politely
 * (robots.txt respected, 2s spacing, identifiable UA), classifies, and writes a REVIEW QUEUE.
 * It never edits records.
 *
 * Exit: 0 nothing actionable · 1 findings (see data/review-queue.json) · 3 broken (no data / crash)
 *   --canary : prove the classifier separates known-good from known-bad (exit 0 only if it does)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allRecords } from "./db.js";
import { classify, exitCodeFor, type FetchResult, type Finding } from "./freshness.js";
import { makeCanaryFixtures } from "./freshness-canary.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUEUE = path.join(ROOT, "data", "review-queue.json");
const STATE = path.join(ROOT, "data", "freshness-state.json");
const UA = "BenefitsCityBot/0.3 (+https://aiagentscity.com/benefits/about)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const robotsCache = new Map<string, string[]>();
async function disallowed(u: URL): Promise<string[]> {
  if (robotsCache.has(u.origin)) return robotsCache.get(u.origin)!;
  const rules: string[] = [];
  try {
    const r = await fetch(`${u.origin}/robots.txt`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(10_000) });
    if (r.ok) {
      let applies = false;
      for (const line of (await r.text()).split(/\r?\n/)) {
        const [k, ...rest] = line.split("#")[0].split(":");
        const key = k.trim().toLowerCase();
        const val = rest.join(":").trim();
        if (key === "user-agent") applies = val === "*" || UA.toLowerCase().includes(val.toLowerCase());
        else if (applies && key === "disallow" && val) rules.push(val);
      }
    }
  } catch {
    /* unreadable robots.txt: proceed (polite fetch, no bypass) */
  }
  robotsCache.set(u.origin, rules);
  return rules;
}

async function fetchPage(url: string): Promise<FetchResult> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { status: null, text: "", error: "invalid url" };
  }
  if ((await disallowed(u)).some((p) => u.pathname.startsWith(p))) return { status: 200, text: "", robotsBlocked: true };
  try {
    const r = await fetch(u, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
    return { status: r.status, text: await r.text() };
  } catch (e) {
    return { status: null, text: "", error: (e as Error).message };
  }
}

function runCanary(): number {
  const { good, bad } = makeCanaryFixtures();
  const g = classify(good.record, good.fetched, null).finding.kind;
  const badKinds = bad.map((x) => classify(x.record, x.fetched, null).finding.kind);
  const ok = g === "ok" && badKinds.every((k) => k !== "ok");
  console.log(`CANARY ${ok ? "PASS" : "FAIL"} — good=${g} bad=[${badKinds.join(",")}]`);
  return ok ? 0 : 1;
}

async function main(): Promise<number> {
  if (process.argv.includes("--canary")) return runCanary();
  const records = allRecords();
  if (records.length === 0) {
    console.error("FRESHNESS BROKEN: zero records loaded (no data is not a pass)");
    return 3;
  }
  const prior: Record<string, string> = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {};
  const next: Record<string, string> = { ...prior };
  const findings: Finding[] = [];
  for (const b of records) {
    const dest = b.source_url ?? b.application_url;
    const fetched = dest && b.status !== "expired" ? await fetchPage(dest) : null;
    const { finding, hash } = classify(b, fetched, prior[b.id] ?? null);
    if (hash) next[b.id] = hash;
    if (finding.kind !== "ok") findings.push(finding);
    if (dest) await sleep(2000);
  }
  fs.mkdirSync(path.dirname(QUEUE), { recursive: true });
  fs.writeFileSync(QUEUE, JSON.stringify({ generated_at: new Date().toISOString(), checked: records.length, findings }, null, 2));
  fs.writeFileSync(STATE, JSON.stringify(next, null, 2));
  for (const f of findings) console.log(`${f.kind.toUpperCase().padEnd(14)} ${f.id} — ${f.detail}`);
  const code = exitCodeFor(findings, records.length);
  const info = findings.filter((f) => f.kind === "blocked" || f.kind === "unreachable").length;
  console.log(`checked ${records.length}, actionable ${findings.length - info}, informational (blocked/unreachable) ${info} → ${QUEUE}`);
  if (code === 3) console.error("FRESHNESS BROKEN: no page could be fetched (no data is not a pass)");
  return code;
}

main().then(
  (c) => process.exit(c),
  (e) => {
    console.error("FRESHNESS BROKEN:", e);
    process.exit(3);
  },
);
