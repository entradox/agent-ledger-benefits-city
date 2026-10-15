#!/usr/bin/env python3
"""Build the catalog target queue (the worker loop's input) — D-1638 companion.

Input : docs/bridge/data/theirs-inventory.json  (built by inventory_gap.py)
        the cached offers sitemap (for the reference URL of each name)
Output: docs/bridge/data/target-queue.json + target-queue.csv

Tranches
  A  business + brokerage — zero coverage today, national, biggest bonuses
  B  national / well-known brands (Ally, Chime, Schwab, Delta, Hilton, ...)
  C  the long tail — community banks and credit unions, mostly single-state

NOTHING here is offer data. This is a list of things that exist and need our own
verification. The reference URL is a tripwire ("this offer exists"), never a source.
"""
import json, re, csv, collections, os

BASE = "/Users/entradox/AI-Workbench/projects/benefits-city/docs/bridge/data"
SITEMAP = "/Users/entradox/.hermes/cache/web/bankrewards.io-fb8d6c46d7.md"

# name -> reference URL (tripwire only)
raw = open(SITEMAP).read()
url_of = {}
for t, slug in re.findall(r"https://bankrewards\.io/(bank|card|brokerage)/([A-Za-z0-9_\-]+)", raw):
    nm = slug.split("-", 1)[1] if "-" in slug else slug
    url_of.setdefault(nm, f"https://bankrewards.io/{t}/{slug}")

inv = json.load(open(f"{BASE}/theirs-inventory.json"))
missing = inv["missing"]

NATIONAL = re.compile(
    r"Ally|Chime|BECU|MoneyLion|Current|Raisin|Axos|UFB|CITBank|Everbank|Always|FourLeaf|Varo|Marcus|"
    r"NavyFederal|PenFed|Regions|FifthThird|Huntington|HSBC|Citizens|Discover|Amex|Barclays|"
    r"Moomoo|Public|Webull|Robinhood|Schwab|ETRADE|Tastytrade|Stash|Albert|TradeStation|Betterment|"
    r"InteractiveBrokers|eToro|SiloMarkets|Plynk|NinjaTrader|TradeUp|Ark7|CharlesSchwab|"
    r"United|Delta|Southwest|Hilton|Marriott|JetBlue|IHG|Atmos|Bilt|Choice|Wyndham|OneKey|Target|"
    r"AAdvantage|Aeroplan|AerLingus|Iberia|BritishAirways|AirFrance|Frontier|American|CapitalOne|"
    r"Chase|WellsFargo|USBank|BankofAmerica|Citi(?![a-z])|KeyBank|Key(?![a-z])|TD|BMO|PNC|Truist|SoFi|"
    r"Ameriprise|Simmons|Fulton|Banner|BlueVine|Grasshopper|Northshore|LiveOak|CitizensBank", re.I)

def tranche(m):
    if m["type"] == "brokerage" or re.search(r"business", m["name"], re.I):
        return "A"
    if NATIONAL.search(m["name"]):
        return "B"
    return "C"

TYPE_MAP = {"bank": "bank_account", "card": "credit_card", "brokerage": "brokerage"}

rows = []
for m in missing:
    name = m["name"]
    t = tranche(m)
    our_type = TYPE_MAP[m["type"]]
    if re.search(r"business", name, re.I) and our_type == "bank_account":
        our_type = "bank_account"  # business is derived from product_name, not a type
    rows.append({
        "target_id": re.sub(r"(?<!^)(?=[A-Z])", "-", name).lower(),
        "slug_name": name,
        "type": m["type"],
        "our_bonus_type": our_type,
        "tranche": t,
        "reference_url": url_of.get(name, ""),
        "status": "todo",
        "notes": "",
    })

order = {"A": 0, "B": 1, "C": 2}
rows.sort(key=lambda r: (order[r["tranche"]], r["type"], r["slug_name"]))

json.dump({"generated": "2026-10-11", "count": len(rows), "rows": rows},
          open(f"{BASE}/target-queue.json", "w"), indent=1)
with open(f"{BASE}/target-queue.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
    w.writeheader(); w.writerows(rows)

c = collections.Counter(r["tranche"] for r in rows)
print("queue built:", len(rows), "targets")
print("by tranche:", dict(c))
print("by type   :", dict(collections.Counter(r["type"] for r in rows)))
print("  A sample:", [r["slug_name"] for r in rows if r["tranche"] == "A"][:8])
print("  B sample:", [r["slug_name"] for r in rows if r["tranche"] == "B"][:8])
print("  C sample:", [r["slug_name"] for r in rows if r["tranche"] == "C"][:8])
print("with reference_url:", sum(1 for r in rows if r["reference_url"]))
print("wrote:", f"{BASE}/target-queue.json + .csv")
