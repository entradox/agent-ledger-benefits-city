#!/usr/bin/env bash
# Rebuild public/assets/archivo-latin.woff2 — the one self-hosted subset variable font (H6, D-1562).
#
# Upstream: google/fonts ofl/archivo — SIL Open Font License 1.1, Archivo Project Authors
# (https://github.com/Omnibus-Type/Archivo). The upstream file carries two axes (wdth 62-125,
# wght 100-900); this site uses normal width only, so wdth is pinned to its default and the wght
# axis is kept, letting one ~28 KB file serve every weight the stylesheet asks for.
#
# The unicode range is not a guess. It is every non-ASCII codepoint the public pages can render
# (© · – — “ ” … ← →) plus basic latin for the dollar sign and digits. A glyph missing from the
# subset falls back to a system font mid-line, which on a page that claims legibility reads as a
# rendering bug. Re-derive the list with:
#   grep -o '[^ -~]' src/*.ts | sort -u
# That grep also returns U+26A0/U+FE0F (the warning sign emitted by src/internal-dashboard.ts,
# which is behind METRICS_TOKEN and never on a public page). They are not in this range because
# upstream Archivo carries no such glyph — checked against the same OFL file: 653 upstream glyphs,
# no U+26A0. Adding them to --unicodes is a silent no-op, so the fallback there is upstream, not a
# subsetting mistake. Do not "fix" it by widening the range; pick a different glyph instead.
#
# Requires: python3 with fontTools + brotli (pyftsubset), and network access for the upstream font.
# Usage: scripts/build-fonts.sh [output-dir]   (default: public/assets)
set -euo pipefail

OUT_DIR="${1:-public/assets}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Deterministic output: fontTools stamps head.created/modified from SOURCE_DATE_EPOCH, so pinning
# it makes this script produce a byte-identical woff2 on every run (verified: two runs, one hash).
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-1704067200}"

PYTHON="${PYTHON:-python3}"
PYFTSUBSET="$(command -v pyftsubset || true)"
if [ -z "$PYFTSUBSET" ]; then
  echo "pyftsubset not found on PATH. Install fontTools + brotli:  $PYTHON -m pip install fonttools brotli" >&2
  exit 1
fi

echo "fetching upstream Archivo (OFL 1.1)"
curl -fsSL -o "$WORK/Archivo[wdth,wght].ttf" \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/archivo/Archivo%5Bwdth%2Cwght%5D.ttf"

echo "pinning wdth to its default 100"
"$PYTHON" -m fontTools.varLib.instancer "$WORK/Archivo[wdth,wght].ttf" wdth=100 --output="$WORK/Archivo-wght.ttf"

echo "subsetting to latin + the site's non-ASCII glyphs"
"$PYFTSUBSET" "$WORK/Archivo-wght.ttf" \
  --output-file="$OUT_DIR/archivo-latin.woff2" \
  --flavor=woff2 \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2013-2014,U+2018-201D,U+2022,U+2026,U+2190-2192" \
  --layout-features=kern,liga,clig,calt,tnum,onum \
  --no-hinting \
  --no-recalc-timestamp \
  --name-IDs=1,2,3,4,5,6,13,14 \
  --drop-tables+=DSIG

ls -l "$OUT_DIR/archivo-latin.woff2"
