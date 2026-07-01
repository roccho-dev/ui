import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(process.argv[2] || 'purpose-atlas-preview-artifact');
const htmlPath = path.join(root, 'dist', 'purpose-atlas-v6-a2ui-ui-refactor.preview.html');
const surfacePath = path.join(root, 'dist', 'a2ui', 'purpose-atlas.surface.jsonl');
const dataPath = path.join(root, 'atlas-data.json');

function read(file) {
  assert.equal(fs.existsSync(file), true, `${file} must exist`);
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(text.length > 0, `${file} must not be empty`);
  return text;
}
function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }
function rows(text) { return text.trim().split(/\n+/).map((line) => JSON.parse(line)); }
function kinds(data) { return new Set((data.base_nodes || []).map((node) => node.kind)); }
function nodeById(data, id) { return (data.base_nodes || []).find((node) => node.id === id); }

const html = read(htmlPath);
const surfaceText = read(surfacePath);
const dataText = read(dataPath);
const surface = rows(surfaceText);
const create = surface.find((row) => row.createSurface)?.createSurface;
const update = surface.find((row) => row.updateComponents)?.updateComponents;
const component = update?.components?.[0];
const tree = JSON.stringify(component?.document?.tree || {});
const css = component?.document?.styles?.css || '';
const data = JSON.parse(dataText);
const kindSet = kinds(data);
const futureRetirement = nodeById(data, 'residual.future-purpose-atlas-ui-retirement');

assert.equal(create?.surfaceId, 'purpose-atlas');
assert.equal(component?.component, 'A2uiSduiSurface');
assert.ok(tree.includes('atlasStage'), 'surface must keep atlasStage port');
assert.ok(tree.includes('Purpose closure object'), 'surface must show closure object panel');
assert.ok(tree.includes('Selected gap'), 'surface must show selected gap section');
assert.ok(tree.includes('Work order'), 'surface must show work order section');
assert.ok(tree.includes('Receipt'), 'surface must show receipt section');
assert.ok(tree.includes('Residual next input'), 'surface must show residual section');
assert.ok(css.includes('sdui-stage'), 'surface css must include stage layout');
for (const kind of ['purpose', 'gap', 'work_order', 'receipt', 'residual']) assert.ok(kindSet.has(kind), `atlas data must include ${kind}`);
assert.equal(futureRetirement?.kind, 'residual', 'atlas data must mark future Purpose Atlas UI retirement as a residual');
assert.equal(futureRetirement?.retirement_state, 'future', 'Purpose Atlas UI retirement must stay future-scoped');
assert.match(futureRetirement?.false_positive_guard || '', /not present preview UI as final product surface/, 'Purpose Atlas UI must not overclaim final-product status');
assert.ok(html.includes('<purpose-atlas-app'), 'standalone HTML must boot the Purpose Atlas app');
const embedded = html.match(/const __purposeAtlasSurfaceJsonl = ("(?:\\.|[^"])*");/s);
assert.ok(embedded, 'standalone HTML must embed A2UI surface JSONL');
assert.equal(JSON.parse(embedded[1]), surfaceText, 'standalone HTML must embed the exact uploaded surface');
assert.equal(html.includes('source-ui.css'), false, 'standalone HTML must not rely on legacy source-ui.css');

console.log(JSON.stringify({
  status: 'purpose-atlas-upload-artifact-pass',
  htmlSha256: sha256(html),
  surfaceSha256: sha256(surfaceText),
  dataSha256: sha256(dataText),
  futureRetirement: futureRetirement.id,
  kinds: [...kindSet].sort(),
}, null, 2));
