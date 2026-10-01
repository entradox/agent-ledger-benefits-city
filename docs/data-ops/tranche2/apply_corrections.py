"""Apply the verified 2026-10-01 tranche-2 data corrections to the Benefits City seed data.

Every change is asserted against the value it expects to replace, so a re-run is a no-op that fails
loudly rather than silently double-applying. Run from the repo root.
"""
import json
import pathlib

base = pathlib.Path("seed-data")


def load(f):
    with open(base / f) as fh:
        return json.load(fh)


def save(f, d):
    with open(base / f, "w") as fh:
        json.dump(d, fh, indent=2, sort_keys=True)
        fh.write("\n")


def get(recs, i):
    m = [r for r in recs if r["id"] == i]
    assert len(m) == 1, f"expected exactly one {i}, got {len(m)}"
    return m[0]


changed = []

# --- 1. Associated Bank: understated states, wrong min deposit, top-tier-as-headline ---
b = load("bank-account-bonuses.json")
a = get(b, "associated-bank-checking-600")
assert a["states_available"] == ["WI", "IL", "MN"], a["states_available"]
a["states_available"] = ["IA", "IL", "IN", "KS", "MI", "MN", "MO", "OH", "WI"]
assert a["min_deposit_usd"] == 100, a["min_deposit_usd"]
a["min_deposit_usd"] = 25
assert a["bonus_amount_usd"] == 600, a["bonus_amount_usd"]
# The ranked value must be what the qualifying action alone earns. The $600 needs a $10,000+
# average daily balance; ranking on it puts this at the top of every "biggest bonus" surface
# while a normal applicant receives $300.
a["bonus_amount_usd"] = 300
a["bonus_max_usd"] = 600
a["requirements"].append(
    "IMPORTANT: the $600 figure is the TOP TIER ONLY and requires a $10,000+ average daily balance "
    "across all open Associated Bank deposit accounts for days 31-90. Completing only the "
    "direct-deposit requirement earns $300."
)
changed.append(
    "associated-bank-checking-600: states 3->9, min_deposit 100->25, ranked value 600->300 "
    "(bonus_max_usd=600)"
)

# --- 2/3/4/5/6. Card corrections ---
c = load("credit-card-bonuses.json")

e = get(c, "citi-strata-elite-75k")
assert "japan-airlines" in e["source_url"], e["source_url"]
e["source_url"] = "https://www.citi.com/credit-cards/citi-strata-elite-card"
e["application_url"] = "https://www.citi.com/credit-cards/citi-strata-elite-card"
assert any("48 month" in r.lower() or "48-month" in r.lower() for r in e["requirements"])
e["requirements"] = [
    r for r in e["requirements"] if "48 month" not in r.lower() and "48-month" not in r.lower()
]
e["requirements"].append(
    "Eligibility: not available if you currently have or previously had a Citi Strata Elite account. "
    "The 48-month rule applies to the Citi Strata PREMIER card, not this one (corrected 2026-10-01)."
)
e["last_verified_date"] = "2026-10-01"
changed.append(
    "citi-strata-elite-75k: source_url -> issuer page; dropped the Premier-only 48-month rule"
)

p = get(c, "citi-strata-premier-60k")
assert "japan-airlines" in p["source_url"], p["source_url"]
p["source_url"] = "https://www.citi.com/credit-cards/citi-strata-premier-card"
p["application_url"] = "https://www.citi.com/credit-cards/citi-strata-premier-card"
p["last_verified_date"] = "2026-10-01"
changed.append("citi-strata-premier-60k: source_url -> issuer page")

ap = get(c, "amex-business-platinum-300k")
assert ap["bonus_points"] == 300000, ap["bonus_points"]
ap["bonus_points"] = 200000
assert ap["bonus_amount_usd"] == 6000, ap["bonus_amount_usd"]
ap["bonus_amount_usd"] = 4000  # 200,000 pts @ 2.0 cpp, the basis already used for this record
ap["requirements"].append(
    "The public offer confirmed 2026-10-01 is 200,000 points. Offers of 250,000-300,000 points are "
    "targeted/YMMV and are not available to every applicant; this record now tracks the public offer."
)
ap["last_verified_date"] = "2026-10-01"
changed.append(
    "amex-business-platinum-300k: 300000 -> 200000 pts / $6000 -> $4000 (targeted offer removed)"
)

d = get(c, "discover-it-cash-back-match")
assert d["bonus_amount_usd"] == 525, d["bonus_amount_usd"]
assert "financebuzz" in d["source_url"], d["source_url"]
d["source_url"] = "https://www.discover.com/credit-cards/cash-back/it-card.html"
d["application_url"] = "https://www.discover.com/credit-cards/cash-back/it-card.html"
d["bonus_amount_usd"] = 0
d["requirements"].append(
    "This card pays an UNCAPPED dollar-for-dollar cashback match on all cash back earned in the first "
    "year, with no purchase minimum and no maximum. Discover publishes no fixed dollar bonus, so there "
    "is no single headline amount (the previously stored $525 was a third-party average estimate)."
)
d["last_verified_date"] = "2026-10-01"
changed.append(
    "discover-it-cash-back-match: $525 estimate -> 0 (uncapped match); source -> issuer page"
)

for i, url in (
    ("bofa-premium-rewards-60k", "https://www.bankofamerica.com/credit-cards/products/premium-rewards-credit-card/"),
    ("capital-one-venture-x-75k", "https://www.capitalone.com/credit-cards/venture-x/"),
):
    r = get(c, i)
    r["source_url"] = url
    r["application_url"] = url
    r["last_verified_date"] = "2026-10-01"
    changed.append(f"{i}: citation -> issuer product page")

# --- 7. Bank offers re-confirmed on issuer pages today (BMO excluded: page unretrievable) ---
for i in (
    "us-bank-smartly-checking-450",
    "sofi-checking-savings-400",
    "keybank-key-smart-checking-300",
    "capital-one-360-checking-250",
    "pnc-virtual-wallet-performance-select-400",
):
    get(b, i)["last_verified_date"] = "2026-10-01"
changed.append("5 bank offers re-confirmed on issuer pages -> last_verified_date 2026-10-01")

# --- Fill the two keys MCP requires, so no record can break a structured response ---
filled = 0
for recs in (b, c):
    for r in recs:
        for k in ("bonus_points", "annual_fee_usd"):
            if k not in r:
                r[k] = None
                filled += 1
changed.append(f"added missing bonus_points/annual_fee_usd keys to {filled} field slots (MCP outputSchema)")

save("bank-account-bonuses.json", b)
save("credit-card-bonuses.json", c)

print("APPLIED:")
for x in changed:
    print(" -", x)
