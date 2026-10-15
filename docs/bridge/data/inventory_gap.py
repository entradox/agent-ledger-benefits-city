#!/usr/bin/env python3
"""Inventory gap: benefits-city live catalog vs bankrewards.io sitemap inventory (D-1636).

Matching rule: their sitemap slug ends with a camel-cased institution/product name
(`...-WellsFargo`, `...-CapitalOneSavor`). We match OUR issuer names against those
with a camel-boundary prefix test, so `Citi` matches `CitiStrata` but NOT
`CitizensBank`, and `Bank of America` does not match `BankofHope`.
"""
import json, re, collections, urllib.request, os

OUT = "/Users/entradox/AI-Workbench/projects/benefits-city/docs/bridge/data"
os.makedirs(OUT, exist_ok=True)

req = urllib.request.Request("https://aiagentscity.com/benefits/api/bonuses.json",
                             headers={"User-Agent": "benefits-city-gapmap/1.0 (one-off analysis)"})
ours = json.load(urllib.request.urlopen(req, timeout=30))
ours = ours if isinstance(ours, list) else ours.get("bonuses", ours.get("records", []))

PATTERNS = {
    "Chase": ["Chase", "JPMorganChase"], "Citi": ["Citi"], "Bank of America": ["BankofAmerica", "BofA"],
    "Wells Fargo": ["WellsFargo"], "U.S. Bank": ["USBank"], "Capital One": ["CapitalOne"],
    "American Express": ["AmericanExpress", "Amex"], "Discover": ["Discover"], "Barclays": ["Barclays"],
    "BMO": ["BMO"], "TD Bank": ["TDBank"], "PNC": ["PNC"], "Truist": ["Truist"],
    "KeyBank": ["Key"], "M&T Bank": ["MTBank"], "Associated Bank": ["AssociatedBank"], "SoFi": ["SoFi"],
}

def camel_prefix(name: str, pref: str) -> bool:
    return name == pref or (name.startswith(pref) and len(name) > len(pref) and name[len(pref)].isupper())

def owner(slug_name: str):
    return next((k for k, pats in PATTERNS.items() if any(camel_prefix(slug_name, p) for p in pats)), None)

txt = open("/Users/entradox/.hermes/cache/web/bankrewards.io-fb8d6c46d7.md").read()
urls = re.findall(r"https://bankrewards\.io/(bank|card|brokerage)/([A-Za-z0-9_\-]+)", txt)
slug_name = lambda s: s.split("-", 1)[1] if "-" in s else s

theirs = collections.defaultdict(collections.Counter)
for t, slug in urls:
    theirs[t][slug_name(slug)] += 1

print(f"OURS: {len(ours)} offers | {dict(collections.Counter(r['bonus_type'] for r in ours))}")
print(f"OURS issuers ({len(set(r['bank_or_issuer'] for r in ours))}): {sorted({r['bank_or_issuer'] for r in ours})}")

matched, missing = [], []
for t in ("bank", "card", "brokerage"):
    for name, c in theirs[t].items():
        o = owner(name)
        (matched if o else missing).append({"type": t, "name": name, "offers": c, "issuer": o})

mo = sum(m["offers"] for m in matched)
mt = sum(m["offers"] for m in missing)
print(f"\nTHEIRS: {sum(len(v) for v in theirs.values())} offers / {sum(len(v) for v in theirs.values())} slugs "
      f"| by type {[(t, sum(v.values())) for t, v in theirs.items()]}")
print(f"OVERLAP (their offers whose issuer we also list): {mo}")
print(f"MISSING offers: {mt} | missing by type {dict(collections.Counter(m['type'] for m in missing))}")
print(f"missing distinct slug-institutions: {len(missing)}")

print("\n--- missing NAMED institutions we could plausibly cover (national / large) ---")
national = [m for m in missing if re.search(
    r"Ally|Chime|BECU|MoneyLion|Current|Raisin|Axos|UFB|CITBank|Everbank|Always|FourLeaf|Marcus|Varo|"
    r"Chime|Varo|NavyFederal|PenFed|Ally|Discover|Amex|Barclays|HSBC|Regions|FifthThird|Huntington|"
    r"Citizens|Moomoo|Public|Webull|Robinhood|Schwab|ETRADE|Tastytrade|Stash|Albert|TradeStation|"
    r"Betterment|Interactive|eToro|SiloMarkets|Plynk|NinjaTrader|TradeUp", m["name"])]
for m in sorted(national, key=lambda x: (x["type"], x["name"]))[:40]:
    print(f"  {m['type']:<9} {m['name']:<42} offers={m['offers']}")

json.dump({"ours": ours}, open(f"{OUT}/ours-inventory.json", "w"), indent=1)
json.dump({"theirs": {t: dict(v) for t, v in theirs.items()}, "matched": matched, "missing": missing,
           "summary": {"ours_offers": len(ours), "their_offers": len(urls),
                       "overlap_offers": mo, "missing_offers": mt,
                       "missing_by_type": dict(collections.Counter(m["type"] for m in missing))}},
          open(f"{OUT}/theirs-inventory.json", "w"), indent=1)
print("\nsaved:", OUT)
