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

sentinel='__nested_chart_data_url_proof__'
data_url="$(BROWSER_PROOF_BASE="${base%/}" BROWSER_PROOF_SENTINEL="$sentinel" node --input-type=module <<'NODE'
import fs from 'node:fs';
import { createUrlModuleUrl } from '../../../packages/url-module/src/codec.mjs';
const records = fs.readFileSync('../../../examples/chart/bar-horizontal.jsonl', 'utf8')
  .split(/\r?\n/u).filter(Boolean).map(line => JSON.parse(line));
const target = records.find(record => record.type === 'region' && record.id === 'product');
if (!target) throw new Error('bar-horizontal product fixture missing');
target.label = process.env.BROWSER_PROOF_SENTINEL;
const value = records.map(record => JSON.stringify(record)).join('\n') + '\n';
console.log(await createUrlModuleUrl({
  base: `${process.env.BROWSER_PROOF_BASE}/adapters/chart/bar-horizontal/`,
  fragment: 'data',
  value,
}));
NODE
)"
data_output="${RUNNER_TEMP:-/tmp}/artifact-feature-chart-bar-horizontal-data.html"
"$chrome" --headless=new --no-sandbox --disable-gpu --virtual-time-budget=30000 --dump-dom "$data_url" > "$data_output"
grep -q 'data-status="pass"' "$data_output"
grep -q "$sentinel" "$data_output"

check_feature presentation 30000 'class="profiled-app"' 'class="seq-svg"'
check_feature control 15000 'id="tree"' 'class="node"'

printf '%s\n' '{"schema":"ui.adapter-browser-proof/10","status":"PASS","directFeatures":["graph","map","seq","chart","presentation","control"],"chartVariants":["bar-horizontal","bar-vertical","line","pie","donut","scatter","heatmap","sunburst"],"nestedChartDataUrl":true,"host":"generic"}'
