import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED_ROW_FIELDS = Object.freeze([
  'kind', 'repoId', 'packageId', 'packagePath', 'packageClass', 'purposeRef',
  'contractRefs', 'assertionRefs', 'receiptRefs', 'readmeProjectionRef', 'status',
]);
const ALLOWED_ROW_FIELDS = new Set(REQUIRED_ROW_FIELDS);
const REPOSITORY_ID = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const assertString = (value, label) => {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
};
const assertRepositoryId = (value, label) => {
  assertString(value, label);
  if (!REPOSITORY_ID.test(value)) throw new Error(`${label} must be an exact owner/repository identity`);
  return value;
};
const parseJsonl = (text, label) => {
  const lines = text.split(/\r?\n/u).filter(line => line.trim().length > 0);
  return lines.map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`${label} line ${index + 1}: invalid JSON`, { cause: error }); }
  });
};
const stableSort = rows => [...rows].sort((a, b) => a.packageId.localeCompare(b.packageId, 'en'));

export function projectGovPackageRows({ rows, profile, sourceCommit }) {
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('rows must be a non-empty array');
  if (
    profile?.schema !== 'ui.semanticMapProjectionProfile/1'
    || profile.profileId !== 'gov-package-output-map/1'
    || profile.authority !== false
    || profile.generatedArtifactsAreAuthority !== false
  ) {
    throw new Error('unsupported projection profile');
  }
  assertString(sourceCommit, 'sourceCommit');
  if (!/^[0-9a-f]{40}$/u.test(sourceCommit)) throw new Error('sourceCommit must be an exact Git SHA');
  const seen = new Set();
  let expectedRepoId = null;
  const normalized = stableSort(rows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`row ${index + 1}: object required`);
    const unknown = Object.keys(row).filter(key => !ALLOWED_ROW_FIELDS.has(key));
    if (unknown.length) throw new Error(`row ${index + 1}: unknown fields: ${unknown.join(',')}`);
    for (const field of REQUIRED_ROW_FIELDS) if (!(field in row)) throw new Error(`row ${index + 1}: missing ${field}`);
    if (row.kind !== profile.input.recordKind) throw new Error(`row ${index + 1}: unsupported kind`);
    const repoId = assertRepositoryId(row.repoId, `row ${index + 1}.repoId`);
    if (expectedRepoId === null) expectedRepoId = repoId;
    else if (repoId !== expectedRepoId) throw new Error(`row ${index + 1}: one projection invocation must contain one repository`);
    for (const field of ['packageId', 'packagePath', 'packageClass', 'purposeRef', 'readmeProjectionRef', 'status']) {
      assertString(row[field], `row ${index + 1}.${field}`);
    }
    for (const field of ['contractRefs', 'assertionRefs', 'receiptRefs']) {
      if (!Array.isArray(row[field]) || row[field].some(value => typeof value !== 'string' || value.length === 0)) {
        throw new Error(`row ${index + 1}.${field} must be string[]`);
      }
    }
    if (seen.has(row.packageId)) throw new Error(`duplicate packageId: ${row.packageId}`);
    seen.add(row.packageId);
    return row;
  }));

  const rowGap = 460;
  const rootHeight = Math.max(1080, 160 + normalized.length * rowGap);
  const regions = [{
    type: 'region', id: profile.root.id, parent: null, label: profile.root.label,
    kind: 'root', bounds: [0, 0, 1680, rootHeight], summary: profile.root.summary,
  }];
  const relations = [];
  for (const [rowIndex, row] of normalized.entries()) {
    const packageY = 160 + rowIndex * rowGap;
    const refsY = 70 + rowIndex * rowGap;
    const packageId = `package:${row.packageId}`;
    regions.push({
      type: 'region', id: packageId, parent: profile.root.id, label: row.packageId,
      kind: 'package', bounds: [300, packageY, 300, 150],
      summary: profile.packageSummaryFields.map(field => `${field}: ${row[field]}`).join('\n'),
      href: `https://github.com/${row.repoId}/tree/${sourceCommit}/${row.packagePath}`,
    });
    let refIndex = 0;
    for (const binding of profile.referenceBindings) {
      const raw = row[binding.field];
      const values = Array.isArray(raw) ? raw : [raw];
      for (const value of values) {
        if (typeof value !== 'string' || value.length === 0) continue;
        const refId = `ref:${row.packageId}:${binding.field}:${refIndex}`;
        regions.push({
          type: 'region', id: refId, parent: profile.root.id,
          label: `${row.packageId} · ${binding.label}`, kind: binding.kind,
          bounds: [780 + (refIndex % 2) * 390, refsY + Math.floor(refIndex / 2) * 180, 330, 120],
          summary: value,
        });
        relations.push({
          type: 'relation', id: `ref-edge:${row.packageId}:${binding.field}:${refIndex}`,
          from: packageId, to: refId, kind: binding.kind, label: binding.label,
        });
        refIndex += 1;
      }
    }
  }
  return Object.freeze({
    schema: 'ui.semanticMapProjection/1', profileId: profile.profileId, authority: false,
    mapId: 'urn:roccho-dev:governance:gov-package-output:map:1',
    records: Object.freeze([
      Object.freeze({ type: 'meta', schema: 'semantic-map-state/1', root: profile.root.id, title: profile.root.label }),
      ...regions.map(Object.freeze), ...relations.map(Object.freeze),
    ]),
    view: Object.freeze(profile.view),
    counts: Object.freeze({ rows: normalized.length, regions: regions.length, relations: relations.length }),
  });
}

export async function loadAndProject({ meaningPath, profilePath, sourceCommit }) {
  const rows = parseJsonl(await fs.readFile(meaningPath, 'utf8'), 'meaning');
  const profiles = parseJsonl(await fs.readFile(profilePath, 'utf8'), 'profile');
  if (profiles.length !== 1) throw new Error('profile JSONL must contain exactly one row');
  return projectGovPackageRows({ rows, profile: profiles[0], sourceCommit });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const args = Object.fromEntries(process.argv.slice(2).map(argument => {
    const index = argument.indexOf('=');
    if (!argument.startsWith('--') || index < 3) throw new Error(`expected --name=value, got ${argument}`);
    return [argument.slice(2, index), argument.slice(index + 1)];
  }));
  for (const name of ['meaning', 'profile', 'source-commit', 'out']) if (!args[name]) throw new Error(`--${name} is required`);
  const projection = await loadAndProject({ meaningPath: args.meaning, profilePath: args.profile, sourceCommit: args['source-commit'] });
  await fs.mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
  await fs.writeFile(args.out, `${JSON.stringify(projection, null, 2)}\n`);
  console.log(JSON.stringify({ status: 'PASS', ...projection.counts, profileId: projection.profileId, mapId: projection.mapId }));
}
