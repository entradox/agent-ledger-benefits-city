"""Point the Amex records at the issuer's own product page, and record HOW they were actually
verified separately.

The 2026-10-01 verification run confirmed all four Amex offers only through trackers (americanexpress.com
is JavaScript-rendered and served no welcome-offer figures to a static fetch). The honest model is:
`source_url` names the authoritative page for the terms, `verification` records how we actually
confirmed them and what we used. Citing a tracker ROUNDUP as `source_url` conflated the two and made an
unverified record look sourced.
"""
import json
import pathlib

base = pathlib.Path("seed-data")
p = base / "credit-card-bonuses.json"
cards = json.load(open(p))

AMEX = {
    "amex-platinum-175k": "https://www.americanexpress.com/us/credit-cards/card/platinum/",
    "amex-gold-100k": "https://www.americanexpress.com/us/credit-cards/card/gold-card/",
    "amex-business-platinum-300k": "https://www.americanexpress.com/us/business/credit-cards/business-platinum/",
    "amex-business-gold-200k": "https://www.americanexpress.com/us/business/credit-cards/business-gold/",
}
TRACKERS = {
    "method": "aggregator_consensus",
    "sources": [
        "https://www.doctorofcredit.com/american-express-credit-card-offers/",
        "https://thepointsguy.com/credit-cards/limited-time-card-offers/",
    ],
    "verified_at": "2026-10-01",
}

changed = []
for r in cards:
    url = AMEX.get(r["id"])
    if not url:
        continue
    old = r.get("source_url")
    assert "thepointsguy" in (old or ""), f'{r["id"]} expected a TPG roundup source, got {old}'
    r["source_url"] = url
    r["application_url"] = url
    r["verification"] = TRACKERS
    r["last_verified_date"] = "2026-10-01"
    r["requirements"].append(
        "Verification note: American Express serves welcome-offer figures only to a rendered browser, "
        "so this amount was confirmed 2026-10-01 against bonus trackers rather than a static read of "
        "the issuer page. Confirm your own offer on the issuer page before applying — Amex varies "
        "offers by applicant and channel."
    )
    changed.append(f'{r["id"]}: source_url -> issuer product page; verification recorded as tracker-confirmed')

with open(p, "w") as fh:
    json.dump(cards, fh, indent=2, sort_keys=True)
    fh.write("\n")

print("APPLIED:")
for c in changed:
    print(" -", c)
