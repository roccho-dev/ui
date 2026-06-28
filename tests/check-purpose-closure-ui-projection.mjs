import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const surfaceText = fs.readFileSync(path.join(root, 'tests/fixtures/purpose-atlas/surface.v0.9.jsonl'), 'utf8');
const atlasData = JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/purpose-atlas/atlas-data.json'), 'utf8'));
const rendererText = fs.readFileSync(path.join(root, 'packages/purpose-atlas-preview/src/components/a2ui-sdui-surface.js'), 'utf8');

const surfaceRows = surfaceText.trim().split(/\n+/).map((line) => JSON.parse(line));
const document = surfaceRows.find((row) => row.updateComponents).updateComponents.components[0].document;
const treeText = JSON.stringify(document.tree);
const cssText = document.styles.css;
const nodes = atlasData.base_nodes || [];
const gap = nodes.find((node) => node.kind === 'gap');
const workOrder = nodes.find((node) => node.kind === 'work_order');
const receipt = nodes.find((node) => node.kind === 'receipt');
const residual = nodes.find((node) => node.kind === 'residual');

assert.ok(gap, 'closure UI fixture must include a gap node');
assert.ok(workOrder, 'closure UI fixture must include a work order node');
assert.ok(receipt, 'closure UI fixture must include a receipt node');
assert.ok(residual, 'closure UI fixture must include a residual node');

for (const key of ['ideal', 'current', 'delta', 'owner_role', 'proof_requirement']) {
  assert.ok(gap[key], `gap must carry ${key}`);
}
for (const key of ['scope', 'non_scope', 'dependency', 'closure_criteria']) {
  assert.ok(Array.isArray(workOrder[key]) && workOrder[key].length > 0, `work order must carry ${key}`);
}
for (const key of ['closed', 'reduced', 'residuals']) {
  assert.ok(Array.isArray(receipt[key]), `receipt must separate ${key}`);
}
assert.ok(residual.next_input, 'residual must carry next projection input');

for (const token of [
  'Purpose closure object',
  'Selected gap',
  'ideal: {{selectedIdeal}}',
  'current: {{selectedCurrent}}',
  'delta: {{selectedDelta}}',
  'owner: {{selectedOwnerRole}}',
  'proof: {{selectedProofRequirement}}',
  'Work order',
  'scope: {{selectedWorkOrderScope}}',
  'non-scope: {{selectedWorkOrderNonScope}}',
  'route: {{selectedWorkOrderRoute}}',
  'dependency: {{selectedWorkOrderDependency}}',
  'closure: {{selectedWorkOrderClosureCriteria}}',
  'Receipt',
  'status: {{receiptStatus}}',
  'closed: {{receiptClosed}}',
  'reduced: {{receiptReduced}}',
  'residuals: {{receiptResiduals}}',
  'Residual next input',
  '{{residualLabel}} -> {{residualNextInput}}',
]) {
  assert.ok(treeText.includes(token), `surface must render ${token}`);
}

assert.match(treeText, /"when":"selection\.nodeId"/, 'detail panel must remain selection gated');
assert.match(treeText, /"port":"atlasStage"/, 'heavy graph rendering must remain behind atlasStage');
assert.match(cssText, /\.sdui-section/, 'closure sections must be surface-level CSS');
assert.doesNotMatch(rendererText, /ideal:|Work order|Receipt|Residual next input/, 'renderer must not hard-code closure panel copy');
for (const token of ['selectedIdeal', 'selectedWorkOrderScope', 'receiptStatus', 'residualNextInput']) {
  assert.ok(rendererText.includes(token), `renderer must expose ${token} as data only`);
}

console.log(JSON.stringify({
  status: 'purpose-closure-ui-projection-pass',
  checked: ['gap', 'work_order', 'receipt', 'residual'],
}, null, 2));
