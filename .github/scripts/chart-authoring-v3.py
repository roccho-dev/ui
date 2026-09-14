from pathlib import Path


def replace_exact(path, old, new, expected=1):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{path}: expected {expected}, got {count}: {old[:120]!r}')
    p.write_text(text.replace(old, new), encoding='utf-8')


# A projected mark may have a synthetic projection id, but authoring must always
# retain the canonical domain region id separately.
replace_exact(
    'packages/semantic-map/projection/projector.js',
    "    const addRepresentation = (node, region, bounds, mode, depth, extra = {}) => {\n      const regionId = regionProjectionId(node, region.id);",
    "    const addRepresentation = (node, region, bounds, mode, depth, extra = {}) => {\n      const sourceRegionId = extra.sourceRegionId ?? region.id;\n      const regionId = regionProjectionId(node, region.id);",
)
replace_exact(
    'packages/semantic-map/projection/projector.js',
    "        sourceRegionId: region.id,\n        parentRegionId:",
    "        sourceRegionId,\n        sourceLabel: region.label,\n        parentRegionId:",
)
replace_exact(
    'packages/semantic-map/projection/projector.js',
    "        isRoot: node.namespace === '' && region.id === this.domain.meta.root,",
    "        isRoot: node.namespace === '' && sourceRegionId === this.domain.meta.root,",
)
replace_exact(
    'packages/semantic-map/projection/projector.js',
    "          && region.id !== this.domain.meta.root\n",
    "          && sourceRegionId !== this.domain.meta.root\n",
)

# Chart data marks are authorable projections. Their geometry remains derived,
# but they must not be made read-only merely because they are Chart marks.
replace_exact(
    'packages/semantic-map/pattern/view-types/chart/projection.js',
    "      {\n        detailsVisible: false,\n        geometryEditable: false,\n        hasChildren: false,\n        label: mark.label ?? '',\n        readOnly: true,\n        activation:",
    "      {\n        sourceRegionId: mark.sourceId,\n        detailsVisible: false,\n        geometryEditable: false,\n        hasChildren: false,\n        label: mark.label ?? '',\n        activation:",
)

# The active list is an authoring surface, so it exposes domain ids rather than
# synthetic projection ids and deduplicates multiple marks of the same region.
replace_exact(
    'packages/semantic-map/renderer-maxgraph/authoring/active-list.js',
    "const normalizeItems = scene => {\n  const regions = (scene?.representations ?? [])\n    .filter(item => !item.isRoot && !item.isGuide && !item.moduleNamespace)\n    .map(item => Object.freeze({\n      kind: 'region',\n      id: item.regionId,\n      label: item.label || item.regionId,\n      description: `${item.label || item.regionId} — ${item.kind || item.mode || 'region'}`,\n    }));\n  const relations = (scene?.relations ?? [])\n    .filter(item => item.sceneId === 'root' && item.relationIds?.length === 1)\n    .map(item => Object.freeze({\n      kind: 'relation',\n      id: item.relationIds[0],\n      label: item.label || item.relationIds[0],\n      description: `${item.label || item.relationIds[0]} — ${item.kind || 'relation'}`,\n    }));\n  return Object.freeze([...regions, ...relations]);\n};",
    "const normalizeItems = scene => {\n  const regions = new Map();\n  for (const item of scene?.representations ?? []) {\n    if (item.isRoot || item.isGuide || item.moduleNamespace) continue;\n    const id = item.sourceRegionId ?? item.regionId;\n    const label = item.sourceLabel || item.label || id;\n    if (!regions.has(id)) regions.set(id, Object.freeze({\n      kind: 'region',\n      id,\n      label,\n      description: `${label} — ${item.kind || item.mode || 'region'}`,\n    }));\n  }\n  const relations = (scene?.relations ?? [])\n    .filter(item => item.sceneId === 'root' && item.relationIds?.length === 1)\n    .map(item => Object.freeze({\n      kind: 'relation',\n      id: item.relationIds[0],\n      label: item.label || item.relationIds[0],\n      description: `${item.label || item.relationIds[0]} — ${item.kind || 'relation'}`,\n    }));\n  return Object.freeze([...regions.values(), ...relations]);\n};",
)

# Every generic authoring operation must resolve projected cells back to their
# canonical source region id.
adapter = Path('packages/semantic-map/renderer-maxgraph/adapter.js')
text = adapter.read_text(encoding='utf-8')
anchor = "function uniqueCells(cells) {\n  return [...new Set(cells.filter(Boolean))];\n}\n"
if text.count(anchor) != 1:
    raise SystemExit('adapter uniqueCells anchor changed')
text = text.replace(
    anchor,
    anchor + "\nfunction authoringRegionId(cell) {\n  return cell?.semantic?.sourceRegionId ?? cell?.semantic?.regionId ?? null;\n}\n",
)
for old, new in {
    'regionId: cell.semantic.regionId,': 'regionId: authoringRegionId(cell),',
    'regionIds: cells.map((cell) => cell.semantic.regionId),': 'regionIds: cells.map(authoringRegionId),',
    'const from = source?.semantic?.regionId;': 'const from = authoringRegionId(source);',
    'const to = target?.semantic?.regionId;': 'const to = authoringRegionId(target);',
    'regions.add(cell.semantic.regionId);': 'regions.add(authoringRegionId(cell));',
}.items():
    if old not in text:
        raise SystemExit(f'adapter anchor changed: {old}')
    text = text.replace(old, new)
old_set = "function setSelection({ regionIds = [], relationIds = [] }) {\n  const readOnlyRegions = new Set(\n    this.lastScene?.representations.filter((item) => item.readOnly).map((item) => item.regionId) ?? [],\n  );\n  const readOnlyRelations = new Set(\n    this.lastScene?.relations.filter((item) => item.readOnly).flatMap((item) => item.relationIds) ?? [],\n  );\n  this.selectionRegionIds = new Set(regionIds.filter((id) => !readOnlyRegions.has(id)));\n  this.selectionRelationIds = new Set(relationIds.filter((id) => !readOnlyRelations.has(id)));\n  this.restoreSelection(this.lastScene);\n  this.emitSelection();\n}"
new_set = "function setSelection({ regionIds = [], relationIds = [] }) {\n  const editableRegions = new Set(\n    this.lastScene?.representations\n      .filter((item) => !item.readOnly && !item.isGuide && !item.isRoot)\n      .map((item) => item.sourceRegionId ?? item.regionId) ?? [],\n  );\n  const readOnlyRelations = new Set(\n    this.lastScene?.relations.filter((item) => item.readOnly).flatMap((item) => item.relationIds) ?? [],\n  );\n  this.selectionRegionIds = new Set(regionIds.filter((id) => editableRegions.has(id)));\n  this.selectionRelationIds = new Set(relationIds.filter((id) => !readOnlyRelations.has(id)));\n  this.restoreSelection(this.lastScene);\n  this.emitSelection();\n}"
if text.count(old_set) != 1:
    raise SystemExit('adapter setSelection shape changed')
text = text.replace(old_set, new_set)
if 'const visibleId = scene.selectionProxies[regionId];' not in text:
    raise SystemExit('adapter restoreSelection shape changed')
text = text.replace(
    'const visibleId = scene.selectionProxies[regionId];',
    'const visibleId = scene.selectionProxies[regionId] ?? regionId;',
)
old_edit = "function startEditingSelection() {\n  const selectedIds = [...this.selectionRegionIds];\n  if (selectedIds.length !== 1) return false;\n  const cell = this.cellsByRegionId.get(selectedIds[0]);"
new_edit = "function startEditingSelection() {\n  const selectedIds = [...this.selectionRegionIds];\n  if (selectedIds.length !== 1) return false;\n  const visibleId = this.lastScene?.selectionProxies?.[selectedIds[0]] ?? selectedIds[0];\n  const cell = this.cellsByRegionId.get(visibleId);"
if text.count(old_edit) != 1:
    raise SystemExit('adapter startEditingSelection shape changed')
text = text.replace(old_edit, new_edit)
adapter.write_text(text, encoding='utf-8')

# Flip every known legacy test that encoded "Chart means read-only" as a valid
# contract. The new assertions also prove canonical source identity exists.
chart_test = Path('packages/semantic-map/tests/chart_test.mjs')
text = chart_test.read_text(encoding='utf-8')
for old, new in {
    "legacyBars.every(item => item.shape === 'graph-node' && item.readOnly && item.label === '')": "legacyBars.every(item => item.shape === 'graph-node' && !item.readOnly && item.label === '' && domain.regions.has(item.sourceRegionId))",
    "marks.every(item => item.readOnly && item.label === '')": "marks.every(item => !item.readOnly && item.label === '' && domain.regions.has(item.sourceRegionId))",
    "heatmapMarks.every(item => item.shape === 'graph-node' && item.readOnly)": "heatmapMarks.every(item => item.shape === 'graph-node' && !item.readOnly && heatmap.domain.regions.has(item.sourceRegionId))",
    "sunburstSectors.every(item => item.shape === 'vector-sector' && item.readOnly)": "sunburstSectors.every(item => item.shape === 'vector-sector' && !item.readOnly && sunburst.domain.regions.has(item.sourceRegionId))",
    "'MUTATION:chart-read-only'": "'MUTATION:chart-authorable'",
}.items():
    if old not in text:
        raise SystemExit(f'chart_test anchor changed: {old}')
    text = text.replace(old, new)
chart_test.write_text(text, encoding='utf-8')

projection_test = Path('packages/semantic-map/tests/projection_test.mjs')
text = projection_test.read_text(encoding='utf-8')
old = "assert.ok(chartScene.representations.filter((item) => item.mode === 'bar').every((item) => item.readOnly));"
new = "assert.ok(chartScene.representations\n  .filter((item) => item.mode === 'bar')\n  .every((item) => !item.readOnly && chartDomain.regions.has(item.sourceRegionId)));"
if text.count(old) != 1:
    raise SystemExit('projection_test Chart readOnly anchor changed')
projection_test.write_text(text.replace(old, new), encoding='utf-8')
