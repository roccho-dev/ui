import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const roots = Object.freeze({
  semanticMap: path.join(root, 'packages/semantic-map'),
  profiles: path.join(root, 'packages/semantic-map-profiles'),
  govProfile: path.join(root, 'packages/semantic-map-profiles/gov-package-output'),
  connectability: path.join(root, 'packages/connectability'),
});
const EXCLUDED_SEGMENTS = new Set(['tests', 'test', 'examples', 'fixtures', 'vendor', 'migration']);
const EXCLUDED_FILES = new Set(['check.mjs']);
const CODE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const PROVIDER_IMPORT = /(?:^|[/@_-])(?:octokit|github|cloudflare|wrangler|aws-sdk|oidc|r2)(?:$|[/@_.-])/iu;

function inside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function ownerOf(candidate) {
  if (inside(candidate, roots.govProfile)) return 'gov-profile';
  if (inside(candidate, roots.semanticMap)) return 'semantic-map';
  if (inside(candidate, roots.connectability)) return 'connectability';
  if (inside(candidate, roots.profiles)) return 'other-profile';
  return 'other';
}

function forbiddenEdge(from, to) {
  if (from === 'semantic-map') return to === 'gov-profile' || to === 'other-profile' || to === 'connectability';
  if (from === 'connectability') return to === 'semantic-map' || to === 'gov-profile' || to === 'other-profile';
  if (from === 'gov-profile') return to === 'connectability' || to === 'other-profile' || to === 'other';
  return false;
}

function importSpecifiers(source) {
  const found = new Set();
  const staticPattern = /\b(?:import|export)\s+(?:[^'"]*?\s+from\s*)?['"]([^'"]+)['"]/gu;
  const dynamicPattern = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu;
  const requirePattern = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/gu;
  for (const pattern of [staticPattern, dynamicPattern, requirePattern]) {
    for (const match of source.matchAll(pattern)) found.add(match[1]);
  }
  return [...found].sort();
}

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_SEGMENTS.has(entry.name)) continue;
      files.push(...await walk(absolute));
    } else if (!EXCLUDED_FILES.has(entry.name) && CODE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(absolute);
    }
  }
  return files.sort();
}

function relative(candidate) {
  return path.relative(root, candidate).split(path.sep).join('/');
}

function dependencyNames(packageJson) {
  return Object.keys({
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.optionalDependencies ?? {}),
    ...(packageJson.peerDependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  });
}

assert.equal(forbiddenEdge('semantic-map', 'connectability'), true);
assert.equal(forbiddenEdge('semantic-map', 'gov-profile'), true);
assert.equal(forbiddenEdge('connectability', 'semantic-map'), true);
assert.equal(forbiddenEdge('gov-profile', 'connectability'), true);
assert.equal(forbiddenEdge('gov-profile', 'semantic-map'), false);
assert.equal(PROVIDER_IMPORT.test('@octokit/rest'), true);
assert.equal(PROVIDER_IMPORT.test('node:path'), false);
assert.deepEqual(importSpecifiers(`
  import './a.js';
  export * from './b.js';
  const c = import('./c.js');
  const d = require('./d.cjs');
`), ['./a.js', './b.js', './c.js', './d.cjs']);

for (const directory of Object.values(roots)) await fs.access(directory);

const profileDirectories = (await fs.readdir(roots.profiles, { withFileTypes: true }))
  .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
  .map(entry => entry.name)
  .sort();
assert.deepEqual(profileDirectories, ['gov-package-output']);

const productionFiles = [
  ...await walk(roots.semanticMap),
  ...await walk(roots.govProfile),
  ...await walk(roots.connectability),
];
const edges = [];
const providerImports = [];
for (const file of productionFiles) {
  const source = await fs.readFile(file, 'utf8');
  const from = ownerOf(file);
  for (const specifier of importSpecifiers(source)) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('node:')) {
      if (PROVIDER_IMPORT.test(specifier)) providerImports.push({ file: relative(file), specifier });
      continue;
    }
    if (!specifier.startsWith('.')) continue;
    const target = path.resolve(path.dirname(file), specifier);
    const to = ownerOf(target);
    edges.push({ from, to, file: relative(file), specifier });
  }
}
const forbiddenDependencies = edges.filter(edge => forbiddenEdge(edge.from, edge.to));
assert.deepEqual(forbiddenDependencies, []);
assert.deepEqual(providerImports, []);

const connectabilityPackage = JSON.parse(await fs.readFile(path.join(roots.connectability, 'package.json'), 'utf8'));
assert.equal(connectabilityPackage.exports?.['.'], './src/index.mjs');
const providerDependencies = dependencyNames(connectabilityPackage).filter(name => PROVIDER_IMPORT.test(name));
assert.deepEqual(providerDependencies, []);

const profileRows = (await fs.readFile(path.join(roots.govProfile, 'profile.jsonl'), 'utf8'))
  .split(/\r?\n/u)
  .filter(line => line.trim().length > 0)
  .map(line => JSON.parse(line));
assert.equal(profileRows.length, 1);
assert.equal(profileRows[0].schema, 'ui.semanticMapProjectionProfile/1');
assert.equal(profileRows[0].profileId, 'gov-package-output-map/1');
assert.equal(profileRows[0].authority, false);
assert.equal(profileRows[0].generatedArtifactsAreAuthority, false);

const profileFiles = await walk(roots.govProfile);
const activeProjectors = profileFiles.filter(file => path.basename(file) === 'project.mjs');
assert.deepEqual(activeProjectors.map(relative), [
  'packages/semantic-map-profiles/gov-package-output/project.mjs',
]);
const profileProductionSource = await Promise.all(
  profileFiles.map(async file => [file, await fs.readFile(file, 'utf8')]),
);
const governanceWrites = [];
const inferredAuthority = [];
const generatedAuthorityClaims = [];
for (const [file, source] of profileProductionSource) {
  if (/\brow(?:\.[A-Za-z_$][\w$]*|\[[^\]]+\])\s*=(?!=)/u.test(source)) governanceWrites.push(relative(file));
  if (/(?:^|[,{]\s*)(?:accepted|current|public)\s*:/mu.test(source)) inferredAuthority.push(relative(file));
  if (/\bauthority\s*:\s*true\b/u.test(source)) generatedAuthorityClaims.push(relative(file));
}
assert.deepEqual(governanceWrites, []);
assert.deepEqual(inferredAuthority, []);
assert.deepEqual(generatedAuthorityClaims, []);

const forbiddenGeneratedSources = [];
async function findGenerated(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'dist' || entry.name === 'generated') forbiddenGeneratedSources.push(relative(absolute));
      else await findGenerated(absolute);
    } else if (entry.name.endsWith('.html')) {
      forbiddenGeneratedSources.push(relative(absolute));
    }
  }
}
await findGenerated(roots.govProfile);
assert.deepEqual(forbiddenGeneratedSources, []);

const intentionalLocalPrimitives = Object.freeze([
  Object.freeze({
    responsibility: 'semantic-state-canonicalization',
    owner: 'semantic-map',
    path: 'packages/semantic-map/domain/canonical-json.js',
    wireNewline: false,
  }),
  Object.freeze({
    responsibility: 'proposal-wire-canonicalization',
    owner: 'connectability',
    path: 'packages/connectability/src/index.mjs',
    wireNewline: true,
  }),
  Object.freeze({
    responsibility: 'semantic-protocol-digest',
    owner: 'semantic-map',
    path: 'packages/semantic-map/protocol/sha256.js',
  }),
  Object.freeze({
    responsibility: 'prepared-proposal-digest',
    owner: 'connectability',
    path: 'packages/connectability/src/index.mjs',
  }),
]);
for (const item of intentionalLocalPrimitives) await fs.access(path.join(root, item.path));

const profileFrameworkFiles = (await fs.readdir(roots.profiles, { recursive: true }))
  .filter(entry => /(?:^|[/\\])(?:registry|plugin)(?:[./\\]|$)/iu.test(String(entry)));
assert.deepEqual(profileFrameworkFiles, []);

const runAll = await fs.readFile(path.join(root, 'tests/run-all.mjs'), 'utf8');
assert.equal(
  [...runAll.matchAll(/check-semantic-map-ownership\.mjs/gu)].length,
  1,
  'ownership gate must be registered exactly once',
);

const receipt = Object.freeze({
  schema: 'ui.semanticMapOwnershipReceipt/1',
  status: 'PASS',
  semanticMapCoreOwnerCount: 1,
  governanceProfileCount: profileDirectories.length,
  connectabilityOutputPortCount: 1,
  providerDependencyInUiCount: providerImports.length + providerDependencies.length,
  governanceMeaningMutationInUiCount: governanceWrites.length,
  acceptedOrCurrentInferenceInUiCount: inferredAuthority.length,
  duplicateActiveGovPackageProjectorCount: Math.max(0, activeProjectors.length - 1),
  generatedAuthorityClaimCount: generatedAuthorityClaims.length,
  forbiddenDependencyCount: forbiddenDependencies.length,
  newFrameworkCount: profileFrameworkFiles.length,
  checkedProductionFileCount: productionFiles.length,
  checkedDependencyEdgeCount: edges.length,
  intentionalLocalPrimitives,
});
console.log(JSON.stringify(receipt));
