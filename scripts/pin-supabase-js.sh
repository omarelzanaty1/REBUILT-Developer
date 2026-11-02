#!/usr/bin/env bash
# Pin the supabase-js script tag in index.html to ONE exact version with a Subresource Integrity (SRI) hash.
#
#   scripts/pin-supabase-js.sh 2.X.Y          download that version from npm, hash it, rewrite index.html
#   scripts/pin-supabase-js.sh --check        re-hash what the CDN serves today and compare it with index.html
#
# WHY: index.html loads  @supabase/supabase-js@2  — a floating tag. Any new 2.x release reaches every visitor the
# moment it is published, unreviewed, and a tampered file would run with the user's session. An exact version plus
# an integrity hash makes the browser refuse any other bytes.
#
# NEEDS the network (npm registry + cdn.jsdelivr.net) and: npm, tar, openssl, curl, python3.
# It was NOT possible to run it where the Phase-3 work was done (no route to those hosts), which is why the tag in
# index.html is still unpinned and tests/strict.test.js lists it as a known gap (a todo()). Run it from a machine
# with internet, review the diff of index.html, run `npm test` and `bash tests/browser/run-all.sh`, then commit.
#
# What it refuses to do: guess a version, guess a hash, or write a hash it did not compute from the bytes.
# The hash is of the file the CDN actually serves (so the browser's check passes), and it must equal the hash of
# the file inside the npm package (so what we pin is what the library's authors published). If they differ, it stops.
set -euo pipefail
cd "$(dirname "$0")/.."
HTML=index.html
CDN=https://cdn.jsdelivr.net/npm/@supabase/supabase-js

need() { command -v "$1" >/dev/null 2>&1 || { echo "missing tool: $1" >&2; exit 2; }; }
for t in npm tar openssl curl python3; do need "$t"; done
sri() { echo "sha384-$(openssl dgst -sha384 -binary "$1" | openssl base64 -A)"; }

tag_now() { grep -o '<script[^>]*supabase-js[^>]*>' "$HTML" | head -n 1; }

if [ "${1:-}" = "--check" ]; then
  tag="$(tag_now)"
  [ -n "$tag" ] || { echo "no supabase-js script tag found in $HTML" >&2; exit 1; }
  src="$(echo "$tag" | sed -n 's/.*src="\([^"]*\)".*/\1/p')"
  want="$(echo "$tag" | sed -n 's/.*integrity="\([^"]*\)".*/\1/p')"
  [ -n "$want" ] || { echo "NOT PINNED: the tag has no integrity attribute: $tag" >&2; exit 1; }
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  curl -fsSL "$src" -o "$tmp/f.js"
  got="$(sri "$tmp/f.js")"
  [ "$got" = "$want" ] && { echo "OK: the CDN still serves the pinned bytes ($want)"; exit 0; }
  echo "MISMATCH: index.html pins $want but the CDN serves $got" >&2; exit 1
fi

VER="${1:-}"
[[ "$VER" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "usage: $0 <exact version, e.g. 2.X.Y> | --check" >&2; exit 2; }

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
( cd "$work" && npm pack "@supabase/supabase-js@$VER" --silent >/dev/null && tar -xzf ./*.tgz )
# the browser (UMD) build the package itself names for CDNs
FILE="$(python3 -I - "$work/package/package.json" <<'PY'
import json, sys
p = json.load(open(sys.argv[1]))
f = p.get("jsdelivr") or p.get("unpkg")
if not f:
    sys.exit("the package names no browser build (no 'jsdelivr'/'unpkg' field in its package.json)")
print(f.lstrip("./"))
PY
)"
[ -f "$work/package/$FILE" ] || { echo "the package does not contain $FILE" >&2; exit 1; }
npm_hash="$(sri "$work/package/$FILE")"

url="$CDN@$VER/$FILE"
curl -fsSL "$url" -o "$work/cdn.js"
cdn_hash="$(sri "$work/cdn.js")"
if [ "$npm_hash" != "$cdn_hash" ]; then
  echo "STOP: the CDN serves different bytes than the npm package ($url)" >&2
  echo "  npm: $npm_hash" >&2; echo "  cdn: $cdn_hash" >&2; exit 1
fi

new="<script src=\"$url\" integrity=\"$cdn_hash\" crossorigin=\"anonymous\"></script>"
python3 -I - "$HTML" "$new" <<'PY'
import re, sys
path, new = sys.argv[1], sys.argv[2]
s = open(path, encoding="utf-8").read()
pat = re.compile(r'<script[^>]*supabase-js[^>]*></script>')
if len(pat.findall(s)) != 1:
    sys.exit("expected exactly one supabase-js script tag in " + path)
open(path, "w", encoding="utf-8").write(pat.sub(lambda m: new, s))
PY
echo "pinned: $new"
echo "next: the browser suites serve a fake library in place of this file; the browser would now refuse it (integrity mismatch),"
echo "      so first make the runners serve index.html without the integrity attribute, then:"
echo "      npm test && bash tests/browser/run-all.sh   — review the diff of index.html, and commit."
