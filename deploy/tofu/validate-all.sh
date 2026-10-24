#!/usr/bin/env bash
# Runs `tofu init -backend=false`, `tofu validate` and `tofu fmt -check` in every module and env.
# Providers download from registry.opentofu.org during init (validation only, no cloud calls).
# Nothing is ever planned against a real account or applied.
# Usage: deploy/tofu/validate-all.sh [--clean]   (--clean removes .terraform dirs afterwards)
set -uo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
export TF_PLUGIN_CACHE_DIR="${TF_PLUGIN_CACHE_DIR:-${TMPDIR:-/tmp}/maude-tofu-plugin-cache}"
export TF_IN_AUTOMATION=1
mkdir -p "$TF_PLUGIN_CACHE_DIR"

dirs=()
while IFS= read -r f; do dirs+=("$(dirname "$f")"); done < <(find "$root" -name versions.tf -not -path '*/.terraform/*' | sort)

pass=0; fail=0; failed=()
for d in "${dirs[@]}"; do
  rel="${d#"$root"/}"
  log="$(mktemp)"
  ok=1
  (cd "$d" && tofu init -backend=false -input=false -no-color >"$log" 2>&1) || ok=0
  if [ $ok = 1 ]; then (cd "$d" && tofu validate -no-color >>"$log" 2>&1) || ok=0; fi
  (cd "$d" && tofu fmt -check -no-color >>"$log" 2>&1) || ok=0
  if [ $ok = 1 ]; then printf 'PASS  %s\n' "$rel"; pass=$((pass+1))
  else printf 'FAIL  %s\n' "$rel"; sed 's/^/      /' "$log" | tail -25; fail=$((fail+1)); failed+=("$rel"); fi
  rm -f "$log"
done

if grep -rIl $'\xe2\x80\x94' "$root" --exclude-dir=.terraform >/dev/null 2>&1; then
  echo "FAIL  em dash found under deploy/tofu"; fail=$((fail+1))
fi

echo "----"
echo "directories: ${#dirs[@]}  passed: $pass  failed: $fail"
[ "${1:-}" = "--clean" ] && find "$root" -name .terraform -type d -prune -exec rm -rf {} +
[ $fail = 0 ]
