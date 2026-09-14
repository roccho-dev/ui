#!/usr/bin/env bash
set -euo pipefail

base="${1:?base URL required}"
chrome="$(command -v google-chrome || command -v google-chrome-stable || command -v chromium || true)"
test -n "$chrome"

root="${RUNNER_TEMP:-/tmp}/artifact-shell-root.html"
"$chrome" --headless=new --no-sandbox --disable-gpu --virtual-time-budget=5000 --dump-dom "$base/index.html" > "$root"
for adapter in graph map seq chart presentation control; do grep -q "href=\"adapters/$adapter/\"" "$root"; done
! grep -q 'adapters/graph-editor/' "$root"
! grep -q 'adapters/shell/' "$root"

check_feature() {
  name="$1"; budget="$2"; shift 2
  output="${RUNNER_TEMP:-/tmp}/artifact-feature-${name//\//-}.html"
  "$chrome" --headless=new --no-sandbox --disable-gpu --virtual-time-budget="$budget" --dump-dom "$base/adapters/$name/index.html" > "$output"
  if ! grep -q 'data-status="pass"' "$output"; then
    echo "feature=$name failed"
    grep -E 'BLOCKED|fatal|data-status=' "$output" || true
    exit 1
  fi
  for pattern in "$@"; do grep -q "$pattern" "$output"; done
}

check_feature graph 30000 '<svg'
check_feature map 30000 '<svg'
check_feature seq 30000 '<svg'
check_feature chart 30000 '<svg'
for variant in bar-horizontal bar-vertical line pie donut scatter heatmap sunburst; do
  check_feature "chart/$variant" 30000 '<svg'
done
check_feature presentation 30000 'class="profiled-app"' 'class="seq-svg"'
check_feature control 15000 'id="tree"' 'class="node"'

printf '%s\n' '{"schema":"ui.adapter-browser-proof/9","status":"PASS","directFeatures":["graph","map","seq","chart","presentation","control"],"chartVariants":["bar-horizontal","bar-vertical","line","pie","donut","scatter","heatmap","sunburst"],"host":"generic"}'
