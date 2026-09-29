#!/usr/bin/env bash
# Convert the MARBLE lexicon with the converter at a base commit and with the current working tree,
# then compare the output XML. Use this to show that a change to the converter preserves output,
# or to see exactly what it changes.
#
# Usage: scripts/diff-output.sh [-d SDBH|SDBG|both] [-o out-dir] [base-ref]
#   base-ref  commit to compare against (default: merge-base of HEAD and main, or origin/main)
#   -d        dictionary to convert (default: both)
#   -o        where to keep outputs and logs (default: a new temp dir)
#
# Data comes from the sibling checkouts of ubsicap/marble-lexicon and marble-indexes, located next
# to the main checkout even when run from a worktree. Override with MARBLE_LEXICON / MARBLE_INDEXES.
# Both sides use the same pinned --version, so any difference is from the code alone.
# Exits 0 when the outputs are identical, 1 when they differ, 2 on errors.
set -euo pipefail

usage() { sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'; }

dicts=(SDBH SDBG)
out=''
while getopts 'd:o:h' opt; do
  case $opt in
    # tr rather than ${OPTARG^^}, which macOS's stock bash 3.2 does not support
    d) dict=$(tr '[:lower:]' '[:upper:]' <<< "$OPTARG")
       case $dict in
         SDBH | SDBG) dicts=("$dict") ;;
         BOTH) ;;
         *) echo "Unknown dictionary: $OPTARG" >&2; exit 2 ;;
       esac ;;
    o) out=$OPTARG ;;
    h) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
shift $((OPTIND - 1))

repo=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
if [[ $# -eq 0 ]]; then
  main=$(git -C "$repo" rev-parse --verify -q main || git -C "$repo" rev-parse --verify -q origin/main) ||
    { echo "Neither main nor origin/main exists; pass a base-ref" >&2; exit 2; }
  set -- "$(git -C "$repo" merge-base HEAD "$main")"
fi
base_ref=$1
base_sha=$(git -C "$repo" rev-parse --short "$base_ref")
main_checkout=$(dirname "$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)")
lexicon=${MARBLE_LEXICON:-$main_checkout/../marble-lexicon}
indexes=${MARBLE_INDEXES:-$main_checkout/../marble-indexes}
for dir in "$lexicon" "$indexes"; do
  [[ -d $dir ]] || { echo "Missing data checkout: $dir" >&2; exit 2; }
done
# A new worktree has no node_modules. The head run resolves modules from $repo, so link the main
# checkout's rather than only pointing ts-node at it.
if [[ ! -e $repo/node_modules && -d $main_checkout/node_modules ]]; then
  ln -s "$main_checkout/node_modules" "$repo/node_modules"
  echo "Linked $repo/node_modules -> $main_checkout/node_modules"
fi
[[ -d $repo/node_modules ]] || { echo "Run npm install first" >&2; exit 2; }

out=${out:-$(mktemp -d -t marble-diff-XXXXXX)}
mkdir -p "$out"
out=$(cd "$out" && pwd)
version=2000-01-01T00:00:00Z

# The base tree gets just what the converter needs, and shares node_modules with this checkout
base_tree=$out/base-tree
rm -rf "$base_tree"
mkdir -p "$base_tree"
git -C "$repo" archive "$base_ref" src sql package.json tsconfig.json | tar -x -C "$base_tree"
ln -s "$repo/node_modules" "$base_tree/node_modules"

echo "Base:   $base_ref ($base_sha)"
echo "Head:   working tree of $repo"
# An extract from git archive is not a checkout, and one inside another repo would report that repo
lexicon_abs=$(cd "$lexicon" && pwd -P)
lexicon_top=$(git -C "$lexicon" rev-parse --show-toplevel 2> /dev/null || true)
if [[ $lexicon_top == "$lexicon_abs" ]]; then
  echo "Data:   $(git -C "$lexicon" log -1 --format='marble-lexicon %h %cd' --date=short)"
else
  echo "Data:   $lexicon (not a git checkout)"
fi
echo "Output: $out"

convert() { # side tree dict
  local side=$1 tree=$2 dict=$3
  rm -rf "$out/$side/$dict"
  (cd "$tree" && ./node_modules/.bin/ts-node src/convert-marble-lexicon.ts --dictionary-type "$dict" \
    --input "$lexicon/$dict" --domains "$lexicon/$dict" --marble-links "$indexes/Full" \
    --output "$out/$side/$dict" --version "$version") > "$out/$side-$dict.log" 2>&1
}

report_failure() { # side exit-code
  [[ $2 -ne 0 ]] || return 0
  echo "$1 conversion failed (exit $2); last lines of $out/$1-$dict.log:"
  tail -15 "$out/$1-$dict.log" | sed 's/^/  /'
  status=2
}

status=0
for dict in "${dicts[@]}"; do
  echo
  echo "== $dict: converting base and head in parallel..."
  convert base "$base_tree" "$dict" & base_pid=$!
  convert head "$repo" "$dict" & head_pid=$!
  base_ok=0 head_ok=0
  wait $base_pid || base_ok=$?
  wait $head_pid || head_ok=$?
  report_failure base $base_ok
  report_failure head $head_ok
  [[ $base_ok -eq 0 && $head_ok -eq 0 ]] || continue

  echo "Sense domain check (head):"
  sed -n '/^Sense domain check/,/^$/p' "$out/head-$dict.log" | tail -n +2 | sed 's/^/  /'

  # Relative paths keep base/ and head/ in the listing, so a file only one side wrote says which
  if (cd "$out" && diff -rq "base/$dict" "head/$dict") > "$out/diff-$dict.txt"; then
    echo "$dict output identical."
  else
    echo "$dict output differs ($(wc -l < "$out/diff-$dict.txt") files). See: diff -r $out/base/$dict $out/head/$dict"
    sed 's/^/  /' "$out/diff-$dict.txt"
    [[ $status -eq 0 ]] && status=1
  fi
done
exit $status
