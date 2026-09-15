#!/usr/bin/env bash
set -euo pipefail

base="${1:?base URL required}"
chrome="$(command -v google-chrome || command -v google-chrome-stable || command -v chromium || true)"
test -n "$chrome"

root="${RUNNER_TEMP:-/tmp}/artifact-shell-root.html"
"$chrome" --headless=new --no-sandbox --disable-gpu --virtual-time-budget=5000 --dump-dom "$base/index.html" > "$root"
for adapter in graph map seq presentation control; do grep -q "href=\"adapters/$adapter/#data=" "$root"; done
! grep -q 'adapters/graph-editor/' "$root"
! grep -q 'adapters/shell/' "$root"

feature_href() {
  name="$1"
  grep -o "href=\"adapters/$name/#data=[^\"]*\"" "$root" | head -n 1 | cut -d '"' -f 2
}

check_missing_data() {
  name="$1"
  output="${RUNNER_TEMP:-/tmp}/artifact-feature-$name-missing-data.html"
  "$chrome" --headless=new --no-sandbox --disable-gpu --virtual-time-budget=5000 --dump-dom "${base%/}/adapters/$name/index.html" > "$output"
  grep -q 'data-status="fail"' "$output"
  grep -q '#data required' "$output"
}

check_feature() {
  name="$1"; budget="$2"; shift 2
  output="${RUNNER_TEMP:-/tmp}/artifact-feature-$name.html"
  href="$(feature_href "$name")"
  test -n "$href"
  "$chrome" --headless=new --no-sandbox --disable-gpu --virtual-time-budget="$budget" --dump-dom "${base%/}/$href" > "$output"
  if ! grep -q 'data-status="pass"' "$output"; then
    echo "feature=$name failed"
    grep -E 'BLOCKED|fatal|data-status=' "$output" || true
    exit 1
  fi
  for pattern in "$@"; do grep -q "$pattern" "$output"; done
}

for adapter in graph map seq presentation control; do check_missing_data "$adapter"; done

check_feature presentation 30000 'class="profiled-app"' 'data-feature="seq"' '<svg'
check_feature control 15000 'id="tree"' 'class="node"'

source_output="${RUNNER_TEMP:-/tmp}/artifact-feature-control-source.html"
"$chrome" --headless=new --no-sandbox --disable-gpu --virtual-time-budget=5000 --dump-dom "${base%/}/adapters/control/index.html?source=./input.json" > "$source_output"
grep -q 'data-status="fail"' "$source_output"
grep -q '#data required' "$source_output"

for adapter in graph map seq; do
  output="${RUNNER_TEMP:-/tmp}/artifact-adapter-$adapter.html"
  href="$(feature_href "$adapter")"
  test -n "$href"
  "$chrome" --headless=new --no-sandbox --disable-gpu --virtual-time-budget=30000 --dump-dom "${base%/}/$href" > "$output"
  if ! grep -q 'data-adapter-status="pass"' "$output" || ! grep -q '>PASS</output>' "$output"; then
    echo "adapter=$adapter failed"
    grep -E 'INCONCLUSIVE|BLOCKED|data-adapter-status=|<output' "$output" || true
    exit 1
  fi
done

printf '%s\n' '{"schema":"ui.adapter-browser-proof/8","status":"PASS","directFeatures":["presentation","control"],"invocationAdapters":["graph","map","seq"],"host":"generic","input":"#data-only"}'
