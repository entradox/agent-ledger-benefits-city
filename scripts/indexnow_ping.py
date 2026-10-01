#!/opt/miniconda3/bin/python3
"""Tell IndexNow search engines which Benefits City URLs changed.

OUTWARD ACTION: without --dry-run this POSTs to api.indexnow.org. It is never run automatically; run it
deliberately after a deploy (the key file must already be live at <base>/<key>.txt).

  python3 scripts/indexnow_ping.py --dry-run          # print the payload, send nothing
  python3 scripts/indexnow_ping.py                    # send it

Only URLs under --base are submitted (IndexNow requires the key location to cover them).
"""
import argparse
import json
import re
import sys
import urllib.request
from urllib.parse import urlparse

KEY = "c37096a3b4d01bbe528054cc91412083"  # must equal src/indexnow.ts (public by design)
ENDPOINT = "https://api.indexnow.org/IndexNow"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default="https://aiagentscity.com/benefits")
    ap.add_argument("--sitemap-file", help="read this sitemap instead of fetching <base>/sitemap.xml")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    base = a.base.rstrip("/")
    if a.sitemap_file:
        xml = open(a.sitemap_file, encoding="utf-8").read()
    else:
        with urllib.request.urlopen(f"{base}/sitemap.xml", timeout=20) as r:
            xml = r.read().decode("utf-8")

    locs = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", xml)
    urls = [u for u in locs if u == base or u.startswith(base + "/")]
    if not urls:
        print("ERROR: no URLs under the base were found in the sitemap — nothing to submit", file=sys.stderr)
        return 2

    payload = {"host": urlparse(base).netloc, "key": KEY, "keyLocation": f"{base}/{KEY}.txt", "urlList": urls}
    if a.dry_run:
        print("DRY RUN — nothing sent", file=sys.stderr)
        print(json.dumps(payload, indent=2))
        return 0

    req = urllib.request.Request(ENDPOINT, data=json.dumps(payload).encode(), headers={"content-type": "application/json; charset=utf-8"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            print(f"IndexNow accepted {len(urls)} URL(s): HTTP {r.status}")
            return 0
    except urllib.error.HTTPError as e:
        print(f"IndexNow rejected the submission: HTTP {e.code} {e.read().decode()[:200]}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
