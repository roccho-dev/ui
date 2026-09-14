#!/usr/bin/env bash
set -euo pipefail

base="${1:?base URL required}"
chrome="$(command -v google-chrome || command -v google-chrome-stable || command -v chromium || true)"
test -n "$chrome"

root="${RUNNER_TEMP:-/tmp}/artifact-shell-root.html"
"$chrome" --headless=new --no-sandbox --disable-gpu --virtual-time-budget=5000 --dump-dom "$base/index.html" > "$root"
for adapter in graph map seq presentation control graph-editor; do grep -q "href=\"adapters/$adapter/\"" "$root"; done
! grep -q 'adapters/shell/' "$root"

check_feature() {
  name="$1"; budget="$2"; shift 2
  output="${RUNNER_TEMP:-/tmp}/artifact-feature-$name.html"
  "$chrome" --headless=new --no-sandbox --disable-gpu --virtual-time-budget="$budget" --dump-dom "$base/adapters/$name/index.html" > "$output"
  if ! grep -q 'data-status="pass"' "$output"; then
    echo "feature=$name failed"
    grep -E 'BLOCKED|fatal|data-status=' "$output" || true
    exit 1
  fi
  for pattern in "$@"; do grep -q "$pattern" "$output"; done
}

check_feature presentation 30000 'class="profiled-app"' 'data-feature="seq"' '<svg'
check_feature control 15000 'id="tree"' 'class="node"'
check_feature graph-editor 30000 'class="roccho-graph-editor"' 'roccho-graph-editor__canvas' '<svg' 'roccho-graph-editor__projection'

for adapter in graph map seq; do
  output="${RUNNER_TEMP:-/tmp}/artifact-adapter-$adapter.html"
  "$chrome" --headless=new --no-sandbox --disable-gpu --virtual-time-budget=30000 --dump-dom "$base/adapters/$adapter/index.html" > "$output"
  if ! grep -q 'data-adapter-status="pass"' "$output" || ! grep -q '>PASS</output>' "$output"; then
    echo "adapter=$adapter failed"
    grep -E 'INCONCLUSIVE|BLOCKED|data-adapter-status=|<output' "$output" || true
    exit 1
  fi
done

printf '%s\n' '{"schema":"ui.adapter-browser-proof/7","status":"PASS","directFeatures":["presentation","control","graph-editor"],"invocationAdapters":["graph","map","seq"],"host":"generic"}'
