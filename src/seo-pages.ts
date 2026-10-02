/**
 * Benefits City — programmatic SEO pages (HTML + structured data).
 * Content is generated from the served data only (see seo.ts for why pages are gated on real offers).
 * Structured data is ItemList + BreadcrumbList only: we do not sell these products, so Offer/Product
 * markup would misrepresent the page.
 */
import {
  BEST_TYPES, bestOffers, expiringWithin30, indexableStates, issuerBySlug, issuerGroups, regionalStates, stateOffers,
} from "./seo.js";
import { checkRange } from "./checks.js";
import { listAll } from "./db.js";
import { affiliateActive, disclosureShort } from "./links.js";
import { bonusCard, bp, esc, shell, type SiteContext } from "./site.js";
import { daysUntil, formatBonus, formatDate } from "./stats.js";
import type { Bonus } from "./types.js";

/** JSON-LD must not be able to close its own <script>; escape every "<". */
function ldScript(obj: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
}

const NOINDEX = `<meta name="robots" content="noindex,follow">`;

function base(ctx: SiteContext): string {
  return ctx.publicUrl.replace(/\/+$/, "");
}

function itemList(ctx: SiteContext, name: string, offers: Bonus[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: offers.length,
    itemListElement: offers.map((b, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${base(ctx)}/bonuses/${b.id}`,
      name: `${b.bank_or_issuer} ${b.product_name}`,
    })),
  };
}

function breadcrumb(ctx: SiteContext, crumbs: [string, string][]): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [["Home", "/"], ...crumbs].map(([name, p], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: `${base(ctx)}${p === "/" ? "/" : p}`,
    })),
  };
}


function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The highest-value offer in the list, regardless of display order (state pages list regional offers first). */
function top(offers: Bonus[]): Bonus {
  return offers.reduce((best, b) => (b.bonus_amount_usd > best.bonus_amount_usd ? b : best), offers[0]);
}

function factLine(offers: Bonus[]): string {
  const t = top(offers);
  const checked = checkRange(offers).newest;
  return `${plural(offers.length, "current offer", "current offers")}; the highest is ${formatBonus(t.bonus_amount_usd)} (${esc(t.bank_or_issuer)} ${esc(t.product_name)}${t.bonus_type === "credit_card" ? ", estimated value" : ""}).${checked ? ` Most recent source check: ${esc(formatDate(checked))}.` : ""}`;
}

const HOW =
  `Every offer shows where its terms were read and when. See <a href="/about">how we check offers</a>; offers end and change, so confirm with the issuer before applying.`;

function page(
  ctx: SiteContext,
  p: string,
  title: string,
  desc: string,
  h1: string,
  intro: string,
  offers: Bonus[],
  crumbs: [string, string][],
  extraSections = "",
  noindex = false,
): string {
  const ld = ldScript(itemList(ctx, h1, offers)) + "\n" + ldScript(breadcrumb(ctx, crumbs)) + (noindex ? `\n${NOINDEX}` : "");
  const body = `<div class="wrap"><div class="page-head">
    <div class="crumb"><a href="${bp(ctx, "/")}">Home</a>${crumbs.map(([n, c]) => ` · <a href="${bp(ctx, c)}">${esc(n)}</a>`).join("")}</div>
    <h1>${esc(h1)}</h1>
    <p>${intro}</p>
  </div>
  <div class="cards">${offers.map((b) => bonusCard(ctx, b)).join("")}</div>
  ${extraSections}
  <p class="src-line" style="margin-top:28px">${HOW.replace('href="/about"', `href="${bp(ctx, "/about")}"`)}</p>
  </div>`;
  return shell(ctx, title, desc, body, p, ld);
}

export function banksIndexPage(ctx: SiteContext): string | null {
  const groups = issuerGroups();
  if (!groups.length) return null;
  const total = groups.reduce((n, g) => n + g.offers.length, 0);
  const rows = groups
    .map((g) => `<li><a href="${bp(ctx, `/banks/${esc(g.slug)}`)}"><strong>${esc(g.name)}</strong></a> — ${plural(g.offers.length, "offer", "offers")}, up to ${formatBonus(g.offers[0].bonus_amount_usd)}</li>`)
    .join("");
  const ld = ldScript(breadcrumb(ctx, [["Banks and issuers", "/banks"]]));
  const body = `<div class="wrap"><div class="page-head">
    <div class="crumb"><a href="${bp(ctx, "/")}">Home</a> · Banks and issuers</div>
    <h1>Signup bonuses by bank and card issuer</h1>
    <p>${plural(total, "current offer", "current offers")} from ${plural(groups.length, "issuer", "issuers")}. Pick an issuer to see every offer we track from it.</p>
  </div><div class="prose"><ul>${rows}</ul></div></div>`;
  return shell(ctx, "Signup bonuses by bank and issuer", `${total} current US bank, savings and credit-card signup bonuses from ${groups.length} issuers.`, body, "/banks", ld);
}

export function issuerPage(ctx: SiteContext, slug: string): string | null {
  const g = issuerBySlug(slug);
  if (!g) return null;
  return page(
    ctx,
    `/banks/${g.slug}`,
    `${g.name} signup bonuses (${plural(g.offers.length, "current offer", "current offers")})`,
    `${plural(g.offers.length, "current offer", "current offers")} from ${g.name}; highest ${formatBonus(top(g.offers).bonus_amount_usd)}${top(g.offers).bonus_type === "credit_card" ? " (estimated value)" : ""}. Requirements, expiry dates and sources.`,
    `${g.name} signup bonuses`,
    `${esc(g.name)}: ${factLine(g.offers)}`,
    g.offers,
    [["Banks and issuers", "/banks"], [g.name, `/banks/${g.slug}`]],
  );
}

export function statesIndexPage(ctx: SiteContext): string | null {
  const states = regionalStates();
  if (!states.length) return null;
  const rows = states
    .map((s) => `<li><a href="${bp(ctx, `/states/${s.code.toLowerCase()}`)}"><strong>${esc(s.name)}</strong></a> — ${plural(s.offers.length, "regional offer", "regional offers")}</li>`)
    .join("");
  const ld = ldScript(breadcrumb(ctx, [["Bonuses by state", "/states"]])) + (indexableStates().length ? "" : `\n${NOINDEX}`);
  const body = `<div class="wrap"><div class="page-head">
    <div class="crumb"><a href="${bp(ctx, "/")}">Home</a> · Bonuses by state</div>
    <h1>Bank bonuses that depend on where you live</h1>
    <p>Most offers are nationwide. These states have offers limited to local residents or branches; each state page lists them first, then the nationwide offers.</p>
  </div><div class="prose"><ul>${rows}</ul></div></div>`;
  return shell(ctx, "Bank bonuses by state", `Regional US bank bonuses available only in ${states.length} states, plus where to find nationwide offers.`, body, "/states", ld);
}

export function statePage(ctx: SiteContext, code: string): string | null {
  const s = stateOffers(code);
  if (!s) return null;
  const all = [...s.regional, ...s.nationwide];
  return page(
    ctx,
    `/states/${s.code.toLowerCase()}`,
    `Bonuses available in ${s.name} (${plural(s.regional.length, "regional offer", "regional offers")})`,
    `${s.name}: ${plural(s.regional.length, "regional offer", "regional offers")} plus ${s.nationwide.length} nationwide offers you can also open.`,
    `Bank and card bonuses in ${s.name}`,
    `${plural(s.regional.length, "offer is", "offers are")} limited to ${esc(s.name)} (shown first). The rest are nationwide and also available there. ${factLine(all)}`,
    all,
    [["Bonuses by state", "/states"], [s.name, `/states/${s.code.toLowerCase()}`]],
    "",
    !indexableStates().some((x) => x.code === s.code),
  );
}

export function bestPage(ctx: SiteContext, slug: string): string | null {
  const offers = bestOffers(slug);
  if (!offers) return null;
  const label = BEST_TYPES[slug].label;
  return page(
    ctx,
    `/best/${slug}`,
    `Highest ${label} bonuses right now (top ${offers.length} by bonus amount)`,
    `The ${offers.length} highest-amount current ${label} signup bonuses, ranked by stated bonus amount. Commission is never an input to ranking.`,
    `Highest-value ${label} bonuses right now`,
    `Ranked by stated bonus amount${slug === "credit-card" ? " (estimated USD value of points)" : ""} — this is not a recommendation: minimum deposits, direct-deposit and spend requirements differ, and commission is never an input. ${esc(disclosureShort(affiliateActive(listAll())))} ${factLine(offers)}`,
    offers,
    [[`Highest ${label} bonuses`, `/best/${slug}`]],
  );
}

export function expiringPage(ctx: SiteContext): string | null {
  const offers = expiringWithin30();
  if (!offers.length) return null;
  const first = offers[0];
  const d = daysUntil(first.expiry_date);
  return page(
    ctx,
    "/expiring-soon",
    `Bonuses expiring in the next 30 days (${offers.length})`,
    `${plural(offers.length, "offer", "offers")} with a stated end date in the next 30 days, soonest first.`,
    "Bonuses expiring in the next 30 days",
    `${plural(offers.length, "offer", "offers")} end within 30 days. Soonest: ${esc(first.bank_or_issuer)} ${esc(first.product_name)} on ${esc(formatDate(first.expiry_date))}${d != null ? ` (${plural(d, "day", "days")} left)` : ""}. Offers without a stated end date are not listed here.`,
    offers,
    [["Expiring soon", "/expiring-soon"]],
  );
}
