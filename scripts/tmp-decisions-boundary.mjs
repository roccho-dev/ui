import fs from 'node:fs/promises';
import path from 'node:path';

const write = async (file, content) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
};

for (const id of ['graph', 'map', 'seq']) {
  const file = `examples/${id}/example.json`;
  const fixture = JSON.parse(await fs.readFile(file, 'utf8'));
  if (fixture.schema !== 'artifact-capability-fixture/2' || fixture.request?.schema !== 'artifact-invocation/2') throw new Error(`${id}: expected artifact-capability-fixture/2`);
  await write(file, `${JSON.stringify(fixture.request, null, 2)}\n`);
}

await fs.mkdir('packages/decisions-compiler/fixtures/presentation', { recursive: true });
for (const name of ['2-actors.jsonl', '3-actors.jsonl', '4-actors.jsonl']) {
  await fs.rename(`examples/presentation/${name}`, `packages/decisions-compiler/fixtures/presentation/${name}`);
}
await fs.rename('packages/comptime/presentation.mjs', 'packages/decisions-compiler/presentation.mjs');
await fs.rm('packages/comptime/semantic-map.mjs');
await fs.rm('packages/comptime/graph-editor.mjs');
await fs.rm('packages/comptime/index.mjs');
await fs.rmdir('packages/comptime');

const adapter = ({ id, kind = 'invocation', feature = null }) => `${feature ? '' : ''}export const createAdapter = () => Object.freeze({\n${feature ? `  featureModule: 'packages/${feature}/feature.mjs',\n` : ''}  id: '${id}',\n  kind: '${kind}',\n  label: '${id}',\n  source: 'examples/${id}/example.${id === 'control' ? 'jsonl' : 'json'}',\n});\n`;
await write('apps/artifact-shell/adapters/graph.mjs', adapter({ id: 'graph' }));
await write('apps/artifact-shell/adapters/map.mjs', adapter({ id: 'map' }));
await write('apps/artifact-shell/adapters/seq.mjs', adapter({ id: 'seq' }));
await write('apps/artifact-shell/adapters/presentation.mjs', adapter({ id: 'presentation', kind: 'feature', feature: 'presentation' }));
await write('apps/artifact-shell/adapters/graph-editor.mjs', adapter({ id: 'graph-editor', kind: 'feature', feature: 'graph-editor' }));

const buildPath = 'apps/artifact-shell/publication/build-adapters.mjs';
let build = await fs.readFile(buildPath, 'utf8');
build = build.replace("      const input = typeof adapter.compile === 'function' ? await adapter.compile(source) : source;\n      await materializeFeature({ adapter, input, outputRoot, repoRoot, root });", "      await materializeFeature({ adapter, input: source, outputRoot, repoRoot, root });");
build = build.replace("    if (typeof adapter.compile !== 'function') throw new Error(`artifact-adapters: ${adapter.id} compile required`);\n    const compiled = await adapter.compile(source);\n    if (compiled?.schema !== 'artifact-invocation/2') throw new Error(`artifact-adapters: ${adapter.id} compiler did not return artifact-invocation/2`);\n    const encoded = new URL(await createUrlModuleUrl({ base: 'https://artifact-shell.invalid/index.html', fragment: 'invoke', value: compiled }));", "    if (source?.schema !== 'artifact-invocation/2') throw new Error(`artifact-adapters: ${adapter.id} example must be artifact-invocation/2`);\n    const encoded = new URL(await createUrlModuleUrl({ base: 'https://artifact-shell.invalid/index.html', fragment: 'invoke', value: source }));");
if (build.includes('adapter.compile')) throw new Error('build-adapters still owns compile');
await write(buildPath, build);

await fs.mkdir('packages/decisions-compiler/tests', { recursive: true });
await write('packages/decisions-compiler/tests/presentation.mjs', `import assert from 'node:assert/strict';\nimport fs from 'node:fs/promises';\nimport { compilePresentation } from '../presentation.mjs';\n\nconst fixtureRoot = new URL('../fixtures/presentation/', import.meta.url);\nconst uiExample = JSON.parse(await fs.readFile(new URL('../../../examples/presentation/example.json', import.meta.url), 'utf8'));\nfor (const name of ['2-actors.jsonl', '3-actors.jsonl', '4-actors.jsonl']) {\n  const source = await fs.readFile(new URL(name, fixtureRoot), 'utf8');\n  const compiled = await compilePresentation(source);\n  assert.equal(compiled.schema, 'business-model-presentation-minimal-payload/1');\n  assert.equal(compiled.coverage?.pass, true);\n  if (name === '2-actors.jsonl') assert.deepEqual(compiled, uiExample);\n}\nconsole.log('decisions-compiler presentation: PASS');\n`);

const packagePath = 'package.json';
const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'));
pkg.scripts['check:decisions-compiler'] = 'node packages/decisions-compiler/tests/presentation.mjs';
pkg.scripts['check:artifact-runtime'] = `npm run check:decisions-compiler && ${pkg.scripts['check:artifact-runtime']}`;
await write(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
