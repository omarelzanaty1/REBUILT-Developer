#!/usr/bin/env bash
# REBUILT — scripts/release.sh
#
# The ONLY sanctioned way to change Stable, and a way to put it back.
#   Development = this repository (private)               → its own GitHub Pages site
#   Stable      = omarelzanaty1/rebuilt0.4 (public), main → GitHub Pages → https://getrebuilt.online/
# Nothing publishes to Stable by itself: a push here never touches it. A person (or Claude, after the owner's
# explicit approval of THIS commit) runs this script on purpose. See docs/ENVIRONMENTS.md.
#
#   scripts/release.sh status
#   scripts/release.sh promote  <commit-on-development-main>  [--yes]
#   scripts/release.sh rollback <earlier-stable-commit>       [--yes]
#
# What promote does: takes the approved commit's release files (scripts/site-files.txt + tests/auth.test.js),
# lays them over a fresh clone of Stable, keeps everything else there as it is (above all CNAME), runs the
# tests on that result, shows the diff, asks you to type PUBLISH, then makes ONE new commit on Stable's main
# (tagged in its message with "Release-From: <repo>@<sha>") and pushes it normally.
# What rollback does: ONE new commit on Stable's main whose files are exactly those of an earlier release.
# It never forces a push, never rewrites history, and refuses to leave Stable without its CNAME.
# Needs: git, node, tar.

set -euo pipefail

DEV_REMOTE="${REBUILT_DEV_REMOTE:-origin}"
DEV_BRANCH="${REBUILT_DEV_BRANCH:-main}"
DEV_SLUG="${REBUILT_DEV_SLUG:-omarelzanaty1/REBUILT-Developer}"
STABLE_URL="${REBUILT_STABLE_URL:-https://github.com/omarelzanaty1/rebuilt0.4.git}"
STABLE_BRANCH="${REBUILT_STABLE_BRANCH:-main}"
OFFICIAL_DOMAIN="getrebuilt.online"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXTRA_RELEASE_FILES=("tests/auth.test.js")   # the tests that guard the shipped files travel with them

die() { echo "REFUSED: $*" >&2; exit 1; }
TMPS=()
cleanup() { local d; for d in ${TMPS[@]+"${TMPS[@]}"}; do git -C "$HERE" worktree remove --force "$d" >/dev/null 2>&1 || true; rm -rf "$d"; done; }
trap cleanup EXIT
tmpdir() { local d; d="$(mktemp -d)"; TMPS+=("$d"); echo "$d"; }

release_paths() { grep -v '^[[:space:]]*\(#\|$\)' "$HERE/scripts/site-files.txt"; printf '%s\n' "${EXTRA_RELEASE_FILES[@]}"; }

marker_in() { sed -n 's/.*<meta name="rebuilt-build" content="\([^"]*\)".*/\1/p' "$1" | head -n 1; }
marker_at() { git -C "$1" show "$2:index.html" 2>/dev/null | sed -n 's/.*<meta name="rebuilt-build" content="\([^"]*\)".*/\1/p' | head -n 1; }

dev_fetch() { git -C "$HERE" fetch --quiet "$DEV_REMOTE" || die "could not fetch '$DEV_REMOTE' (the Development repository)"; }
stable_clone() { # prints the path of a fresh clone of Stable
  local w; w="$(tmpdir)"
  git clone --quiet "$STABLE_URL" "$w" || die "could not clone Stable ($STABLE_URL)"
  git -C "$w" checkout --quiet "$STABLE_BRANCH" || die "Stable has no branch '$STABLE_BRANCH'"
  git -C "$w" config user.name  "$(git -C "$HERE" config user.name  || echo release-script)"
  git -C "$w" config user.email "$(git -C "$HERE" config user.email || echo release-script@example.invalid)"
  echo "$w"
}
last_release_from() { git -C "$1" log -n 1 --format=%B --grep='^Release-From: ' | sed -n 's/^Release-From: .*@\([0-9a-f]\{7,40\}\)$/\1/p' | head -n 1; }

run_tests_in() { # run every tests/*.test.js found in a directory
  local dir="$1" t rc=0 found=0
  for t in "$dir"/tests/*.test.js; do
    [ -e "$t" ] || continue
    found=1
    echo "--- node tests/$(basename "$t")"
    (cd "$dir" && node "tests/$(basename "$t")" | tail -n 2) || rc=1
  done
  [ "$found" -eq 1 ] || die "no tests/*.test.js in $dir"
  [ "$rc" -eq 0 ] || die "tests failed — nothing was published"
}

confirm() { # $1 = the word to type
  [ "${YES:-}" = "1" ] && return 0
  local answer; read -r -p "Type $1 to continue: " answer
  [ "$answer" = "$1" ] || die "not confirmed — nothing was published"
}

check_cname() { # $1 = a tree-ish source: "dir:<path>" or "rev:<repo>:<rev>"
  local got
  case "$1" in
    dir:*) got="$(tr -d '[:space:]' < "${1#dir:}/CNAME" 2>/dev/null || true)" ;;
    rev:*) local r="${1#rev:}"; got="$(git -C "${r%%:*}" show "${r#*:}:CNAME" 2>/dev/null | tr -d '[:space:]' || true)" ;;
  esac
  [ "$got" = "$OFFICIAL_DOMAIN" ] || die "Stable would lose or change its CNAME ('$got' instead of '$OFFICIAL_DOMAIN') — the official domain must never be touched"
}

cmd_status() {
  dev_fetch
  local dsha w ssha last
  dsha="$(git -C "$HERE" rev-parse "$DEV_REMOTE/$DEV_BRANCH")"
  w="$(stable_clone)"; ssha="$(git -C "$w" rev-parse HEAD)"; last="$(last_release_from "$w")"
  echo "Development  $DEV_SLUG  $DEV_BRANCH  ${dsha:0:7}  [$(marker_at "$HERE" "$dsha")]"
  echo "Stable       $STABLE_URL  $STABLE_BRANCH  ${ssha:0:7}  [$(marker_at "$w" HEAD)]"
  if [ -n "$last" ] && git -C "$HERE" cat-file -e "$last^{commit}" 2>/dev/null; then
    echo "Stable was last released from Development commit ${last:0:7}. Development commits since then:"
    git -C "$HERE" log --oneline "$last..$dsha" | sed 's/^/  /'
  else
    echo "Stable has no 'Release-From' record yet (nothing has been promoted with this script). Latest Development commits:"
    git -C "$HERE" log --oneline -n 10 "$dsha" | sed 's/^/  /'
  fi
}

cmd_promote() {
  local ref="${1:-}" sha w old new p tdir
  [ -n "$ref" ] || die "usage: release.sh promote <commit-on-$DEV_REMOTE/$DEV_BRANCH> [--yes]"
  dev_fetch
  sha="$(git -C "$HERE" rev-parse --verify --quiet "$ref^{commit}")" || die "unknown commit '$ref'"
  git -C "$HERE" merge-base --is-ancestor "$sha" "$DEV_REMOTE/$DEV_BRANCH" || die "${sha:0:7} is not on $DEV_REMOTE/$DEV_BRANCH — only commits that were pushed to Development can be promoted"
  new="$(marker_at "$HERE" "$sha")"; [ -n "$new" ] || die "no build marker in index.html at ${sha:0:7}"

  echo "== 1. tests on the Development commit ${sha:0:7} (a clean checkout of exactly that commit)"
  tdir="$(tmpdir)"; git -C "$HERE" worktree add --quiet --detach "$tdir" "$sha"
  run_tests_in "$tdir"

  echo "== 2. the release, laid over a fresh clone of Stable"
  w="$(stable_clone)"; old="$(marker_in "$w/index.html")"
  [ "$new" != "$old" ] || die "the build marker did not change ('$new'). Bump it so each release can be identified"
  check_cname "dir:$w"
  while IFS= read -r p; do rm -rf "${w:?}/$p"; done < <(release_paths)
  mapfile -t PATHS < <(release_paths)
  git -C "$HERE" archive --format=tar "$sha" -- "${PATHS[@]}" | tar -x -C "$w"
  git -C "$w" add -A -- "${PATHS[@]}"
  git -C "$w" diff --cached --quiet && die "Stable already has exactly these files"
  check_cname "dir:$w"
  echo "Stable  [$old]  ->  [$new]"
  git -C "$w" diff --cached --stat | tail -n 30

  echo "== 3. the tests, run on the result as Stable would hold it"
  run_tests_in "$w"

  confirm "PUBLISH"
  local last since body
  last="$(last_release_from "$w")"; since=""
  if [ -n "$last" ] && git -C "$HERE" cat-file -e "$last^{commit}" 2>/dev/null; then since="$(git -C "$HERE" log --oneline "$last..$sha" | sed 's/^/  /')"; fi
  body="Release-From: $DEV_SLUG@$sha"$'\n'"Build-Marker: $new"
  [ -z "$since" ] || body="$body"$'\n\n'"Development commits in this release:"$'\n'"$since"
  [ -z "${REBUILT_COMMIT_TRAILER:-}" ] || body="$body"$'\n\n'"$REBUILT_COMMIT_TRAILER"
  git -C "$w" commit --quiet -m "Release $new" -m "$body"
  git -C "$w" push --quiet origin "HEAD:refs/heads/$STABLE_BRANCH"
  echo "Published: Stable $STABLE_BRANCH is now $(git -C "$w" rev-parse --short HEAD) (release of Development ${sha:0:7})."
  echo "GitHub Pages builds it in about a minute. Then open https://$OFFICIAL_DOMAIN/ and check the build marker reads: $new"
  echo "Record it in the release log (docs/ENVIRONMENTS.md): version, Development SHA $sha, Stable SHA $(git -C "$w" rev-parse HEAD)."
}

cmd_rollback() {
  local ref="${1:-}" w sha tree new tdir
  [ -n "$ref" ] || die "usage: release.sh rollback <earlier-stable-commit> [--yes]"
  w="$(stable_clone)"
  sha="$(git -C "$w" rev-parse --verify --quiet "$ref^{commit}")" || die "unknown Stable commit '$ref'"
  git -C "$w" merge-base --is-ancestor "$sha" HEAD || die "${sha:0:7} was never on Stable's $STABLE_BRANCH — roll back only to something that was published"
  tree="$(git -C "$w" rev-parse "$sha^{tree}")"
  [ "$tree" != "$(git -C "$w" rev-parse 'HEAD^{tree}')" ] || die "Stable already has exactly the files of ${sha:0:7}"
  check_cname "rev:$w:$sha"
  git -C "$w" cat-file -e "$sha:index.html" 2>/dev/null || die "${sha:0:7} has no index.html"
  echo "Restoring Stable:  [$(marker_at "$w" HEAD)]  ->  [$(marker_at "$w" "$sha")]  (the files of ${sha:0:7})"
  git -C "$w" diff --stat HEAD "$sha" | tail -n 30
  echo "== tests on the restored files"
  tdir="$(tmpdir)"; git -C "$w" worktree add --quiet --detach "$tdir" "$sha"
  run_tests_in "$tdir"
  git -C "$w" worktree remove --force "$tdir"
  confirm "ROLLBACK"
  local msg="Rollback Stable to ${sha:0:7} [$(marker_at "$w" "$sha")]"
  local body="Restores the files of ${sha}; history is kept, nothing is rewritten."
  [ -z "${REBUILT_COMMIT_TRAILER:-}" ] || body="$body"$'\n\n'"$REBUILT_COMMIT_TRAILER"
  new="$(git -C "$w" commit-tree "$tree" -p HEAD -m "$msg" -m "$body")"
  git -C "$w" push --quiet origin "$new:refs/heads/$STABLE_BRANCH"
  echo "Published: Stable $STABLE_BRANCH is now ${new:0:7} (files of ${sha:0:7})."
  echo "GitHub Pages builds it in about a minute. Then open https://$OFFICIAL_DOMAIN/ and check the build marker reads: $(marker_at "$w" "$sha")"
}

YES=""
args=()
for a in "$@"; do if [ "$a" = "--yes" ]; then YES=1; else args+=("$a"); fi; done
set -- ${args[@]+"${args[@]}"}
case "${1:-}" in
  status)   shift; cmd_status "$@" ;;
  promote)  shift; cmd_promote "$@" ;;
  rollback) shift; cmd_rollback "$@" ;;
  *) echo "usage: scripts/release.sh status | promote <commit> [--yes] | rollback <commit> [--yes]" >&2; exit 2 ;;
esac
