/**
 * Benefits City — public changelog (offers added / changed / renewed / removed, and product changes).
 * Source of truth: changelog/changelog.json (kept beside seed-data/, NOT inside it: seed.ts loads every
 * JSON array in seed-data/ as offers). Malformed data fails loudly instead of shipping a broken feed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type ChangeType = "added" | "changed" | "renewed" | "removed" | "feature";
export interface ChangelogEntry {
  id: string;
  date: string;
  type: ChangeType;
  offer_id: string | null;
  title: string;
  summary: string;
}

const TYPES: ChangeType[] = ["added", "changed", "renewed", "removed", "feature"];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_FILE = path.join(ROOT, "changelog", "changelog.json");

export function loadChangelog(file: string = DEFAULT_FILE): ChangelogEntry[] {
  const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("changelog must be a JSON array");
  const perDate = new Map<string, number>();
  const entries = parsed.map((raw: Record<string, unknown>, i) => {
    const where = `changelog[${i}]`;
    if (typeof raw?.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) throw new Error(`${where}: date must be YYYY-MM-DD`);
    if (!TYPES.includes(raw.type as ChangeType)) throw new Error(`${where}: type must be one of ${TYPES.join(", ")}`);
    if (typeof raw.title !== "string" || !raw.title.trim()) throw new Error(`${where}: title is required`);
    if (typeof raw.summary !== "string" || !raw.summary.trim()) throw new Error(`${where}: summary is required`);
    const n = (perDate.get(raw.date) ?? 0) + 1;
    perDate.set(raw.date, n);
    return {
      id: `${raw.date}-${n}`,
      date: raw.date,
      type: raw.type as ChangeType,
      offer_id: typeof raw.offer_id === "string" && raw.offer_id ? raw.offer_id : null,
      title: raw.title,
      summary: raw.summary,
    };
  });
  // Newest date first; within a date keep file order.
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.date.localeCompare(a.e.date) || a.i - b.i)
    .map((x) => x.e);
}

export function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function changelogAtom(publicUrl: string, entries: ChangelogEntry[]): string {
  const updated = `${entries[0]?.date ?? "1970-01-01"}T00:00:00Z`;
  const items = entries
    .map(
      (e) => `  <entry>
    <id>${xmlEscape(`${publicUrl}/changelog#${e.id}`)}</id>
    <title>${xmlEscape(e.title)}</title>
    <updated>${e.date}T00:00:00Z</updated>
    <category term="${xmlEscape(e.type)}"/>
    <summary>${xmlEscape(e.offer_id ? `As of ${e.date}: ${e.summary}` : e.summary)}</summary>
    <link rel="alternate" href="${xmlEscape(e.offer_id && e.type !== "removed" ? `${publicUrl}/bonuses/${e.offer_id}` : `${publicUrl}/changelog`)}"/>
  </entry>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${xmlEscape(`${publicUrl}/changelog`)}</id>
  <title>Benefits City — changelog</title>
  <subtitle>Bank and credit-card signup bonuses: offers added, changed, renewed or removed.</subtitle>
  <rights>Offer terms change and end without notice; each entry reflects what we saw on its date. Check the issuer's own page before applying. Information only, not financial advice.</rights>
  <updated>${updated}</updated>
  <link rel="self" href="${xmlEscape(`${publicUrl}/feed.xml`)}"/>
  <link rel="alternate" href="${xmlEscape(`${publicUrl}/changelog`)}"/>
${items}
</feed>
`;
}

export function changelogJson(publicUrl: string, entries: ChangelogEntry[]): object {
  return { page: `${publicUrl}/changelog`, feed: `${publicUrl}/feed.xml`, entries };
}

let cache: ChangelogEntry[] | null = null;
/** Loaded once per process; a broken file throws on first request and shows in the logs. */
export function changelog(): ChangelogEntry[] {
  return (cache ??= loadChangelog());
}
