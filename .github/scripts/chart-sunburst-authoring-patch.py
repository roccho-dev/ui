from pathlib import Path


def replace_exact(path, old, new, expected=1):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != expected:
        raise SystemExit(f'{path}: expected {expected}, got {count}: {old[:140]!r}')
    p.write_text(text.replace(old, new), encoding='utf-8')


# Root identity belongs to the root boundary representation, not every projection
# sourced from the root domain node. This makes the Sunburst center semantic mark
# authorable while the root boundary remains non-editable by role.
replace_exact(
    'packages/semantic-map/projection/projector.js',
    "        isRoot: node.namespace === '' && sourceRegionId === this.domain.meta.root,",
    "        isRoot: node.namespace === '' && sourceRegionId === this.domain.meta.root && mode === 'boundary',",
)
replace_exact(
    'packages/semantic-map/projection/projector.js',
    "          && sourceRegionId !== this.domain.meta.root\n          && (mode !== 'boundary' || Boolean(extra.geometryEditable)),",
    "          && (mode !== 'boundary' || Boolean(extra.geometryEditable)),",
)

# The feature host already carries set-view activations from Chart projection;
# actually execute them transactionally instead of rendering inert metadata.
runtime = Path('packages/semantic-map/feature-runtime.mjs')
text = runtime.read_text(encoding='utf-8')
old = "  const view = feature?.view ?? defaultViewForPattern(pattern);\n"
new = "  let view = feature?.view ?? defaultViewForPattern(pattern);\n"
if text.count(old) != 1:
    raise SystemExit('feature runtime view anchor changed')
text = text.replace(old, new)
anchor = """  adapter.setOperationHandler(operation => {
    const prepared = prepareRuntimeOperation(operation, store, scope);
    const configKey = patternConfigKey(view.pattern);
    const batch = store.performBatch([prepared], candidate => validatePatternDomain(
      candidate.domain,
      view.pattern,
      configKey === null ? null : view[configKey],
    ));
    return batch.results[0];
  });
"""
addition = anchor + """  adapter.setActivationHandler(activation => {
    invariant(activation?.kind === 'set-view', `unsupported activation ${String(activation?.kind)}`);
    const nextView = activation.view;
    invariant(nextView?.pattern === pattern, `activation view pattern must be ${pattern}`);
    const configKey = patternConfigKey(nextView.pattern);
    validatePatternDomain(
      store.domain,
      nextView.pattern,
      configKey === null ? null : nextView[configKey],
    );
    const previousView = view;
    projector.setView(nextView);
    try {
      const nextScene = render();
      view = nextView;
      return Object.freeze({ kind: 'set-view', pattern: nextScene.pattern });
    } catch (error) {
      projector.setView(previousView);
      render();
      throw error;
    }
  });
"""
if text.count(anchor) != 1:
    raise SystemExit('feature runtime operation-handler anchor changed')
text = text.replace(anchor, addition)
runtime.write_text(text, encoding='utf-8')

# Shared reconnect authoring must also resolve projected cells to canonical source IDs.
authoring = Path('packages/semantic-map/renderer-maxgraph/authoring/index.js')
text = authoring.read_text(encoding='utf-8')
anchor = "const textInput = target => target instanceof HTMLInputElement\n"
helper = "const semanticRegionId = cell => cell?.semantic?.sourceRegionId ?? cell?.semantic?.regionId ?? null;\n\n" + anchor
if text.count(anchor) != 1:
    raise SystemExit('authoring semanticRegionId anchor changed')
text = text.replace(anchor, helper)
for old, new in {
    "    const from = source?.semantic?.regionId;": "    const from = semanticRegionId(source);",
    "    const to = target?.semantic?.regionId;": "    const to = semanticRegionId(target);",
}.items():
    if text.count(old) != 1:
        raise SystemExit(f'authoring reconnect anchor changed: {old}')
    text = text.replace(old, new)
authoring.write_text(text, encoding='utf-8')

# Source tests: initial Sunburst center is an authorable semantic projection of
# the root source, but is not itself the root boundary representation.
chart_test = Path('packages/semantic-map/tests/chart_test.mjs')
text = chart_test.read_text(encoding='utf-8')
anchor = """const sunburstSectors = sunburstScene.representations.filter(item => item.visual?.chartType === SUNBURST_CHART && item.mode === 'slice');
assert.equal(sunburstSectors.length, 14);
"""
addition = anchor + """const sunburstCenter = sunburstScene.representations.find(
  item => item.visual?.chartType === SUNBURST_CHART && item.mode === 'point',
);
assert.equal(sunburstCenter.sourceRegionId, sunburst.domain.meta.root);
assert.equal(sunburstCenter.isRoot, false, 'MUTATION:sunburst-center-not-root-boundary');
assert.equal(sunburstCenter.readOnly, false);
assert.equal(sunburstCenter.labelEditable, true, 'MUTATION:sunburst-center-authorable');
"""
if text.count(anchor) != 1:
    raise SystemExit('chart test initial Sunburst anchor changed')
chart_test.write_text(text.replace(anchor, addition), encoding='utf-8')

# Architecture test must make the activation and canonical reconnect contracts visible.
boundary = Path('packages/semantic-map/tests/authoring_boundary_test.mjs')
text = boundary.read_text(encoding='utf-8')
anchor = "const styles = read('packages/semantic-map/renderer-maxgraph/styles.js');\n"
addition = anchor + "const featureRuntime = read('packages/semantic-map/feature-runtime.mjs');\n"
if text.count(anchor) != 1:
    raise SystemExit('authoring boundary runtime import anchor changed')
text = text.replace(anchor, addition)
anchor = "assert.match(authoringIndex, /activeList/);\n"
addition = anchor + "assert.match(authoringIndex, /semanticRegionId/);\nassert.match(authoringIndex, /sourceRegionId/);\n"
if text.count(anchor) != 1:
    raise SystemExit('authoring boundary reconnect assertion anchor changed')
text = text.replace(anchor, addition)
anchor = "assert.match(adapter, /editingPlugin\\?\\.textarea\\?\\.isConnected/);\n"
addition = anchor + "assert.match(featureRuntime, /setActivationHandler/);\nassert.match(featureRuntime, /activation\\?\\.kind === 'set-view'/);\nassert.match(featureRuntime, /projector\\.setView\\(nextView\\)/);\n"
if text.count(anchor) != 1:
    raise SystemExit('authoring boundary activation assertion anchor changed')
boundary.write_text(text.replace(anchor, addition), encoding='utf-8')
