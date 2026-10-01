"""Capital One Venture: point source_url at the issuer product page (fetched and confirmed 2026-10-01)
while keeping the tracker consensus in `verification`, which already recorded it correctly."""
import json, pathlib
p = pathlib.Path("seed-data/credit-card-bonuses.json")
cards = json.load(open(p))
URL = "https://www.capitalone.com/credit-cards/venture/"
found = 0
for r in cards:
    if r["id"] != "capital-one-venture-75k":
        continue
    assert "thepointsguy.com/credit-cards/limited-time" in r["source_url"], r["source_url"]
    r["source_url"] = URL
    r["application_url"] = URL
    r["last_verified_date"] = "2026-10-01"
    r["requirements"].append(
        "Verification note: the 75,000-mile offer was confirmed against the issuer product page on "
        "2026-10-01; the exact valuation and the $300 travel credit are per the trackers recorded in "
        "the verification block."
    )
    found += 1
assert found == 1, found
with open(p, "w") as fh:
    json.dump(cards, fh, indent=2, sort_keys=True); fh.write("\n")
print("capital-one-venture-75k: source_url -> issuer product page (confirmed live 2026-10-01)")
