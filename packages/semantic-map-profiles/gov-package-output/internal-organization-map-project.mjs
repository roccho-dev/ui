import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const EXPECTED_ROLES = Object.freeze({
  contractGraph: 'contractGraph.current.v1',
  decisionImpact: 'decisionImpact.current.v1',
  evidenceState: 'evidenceState.current.v1',
  obligationState: 'obligationState.current.v1',
  responsibilityClosure: 'responsibilityClosure.current.v1',
  workCurrent: 'workLifecycle.current.v1',
});
const ROLE_NAMES = Object.freeze(Object.keys(EXPECTED_ROLES).sort());
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const GIT_SHA = /^[0-9a-f]{40}$/u;
const REPO_ID = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

function invariant(condition, message) {
  if (!condition) throw new Error(`internal-organization-map: ${message}`);
}

function string(value, label) {
  invariant(typeof value === 'string' && value.length > 0, `${label} must be a non-empty string`);
  return value;
}

function rows(value, label) {
  invariant(Array.isArray(value), `${label} must be an array`);
  return value;
}

function unique(values, label) {
  const seen = new Set();
  for (const value of values) {
    const id = string(value.id, `${label}.id`);
    invariant(!seen.has(id), `duplicate ${label} id ${id}`);
    seen.add(id);
  }
  return seen;
}

function stable(values) {
  return [...values].sort((left, right) => left.id.localeCompare(right.id, 'en'));
}

function parseJsonl(text, label) {
  return text.split(/\r?\n/u).filter(line => line.trim().length > 0).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`${label} line ${index + 1}: invalid JSON`, { cause: error }); }
  });
}

function validateProfile(profile) {
  invariant(profile?.schema === 'ui.semanticMapProjectionProfile/1', 'unsupported profile schema');
  invariant(profile.profileId === 'internal-organization-map/1', 'unsupported profileId');
  invariant(profile.authority === false, 'profile must be non-authority');
  invariant(profile.generatedArtifactsAreAuthority === false, 'generated artifacts must be non-authority');
  invariant(profile.input?.recordKind === 'controlSurface.bundle.v1', 'profile input kind mismatch');
  invariant(profile.view?.pattern === 'map/1', 'profile must open in map/1');
  return profile;
}

function validateBundle(bundle) {
  invariant(bundle?.kind === 'controlSurface.bundle.v1', 'bundle kind mismatch');
  invariant(bundle.authority === false, 'bundle must be non-authority');
  invariant(bundle.decisionRef === 'https://github.com/roccho-dev/adrs/issues/331', 'bundle decisionRef mismatch');
  invariant(SHA256.test(bundle.inputDigest || ''), 'bundle inputDigest must be exact sha256');
  invariant(SHA256.test(bundle.semanticDigest || ''), 'bundle semanticDigest must be exact sha256');
  invariant(Array.isArray(bundle.inputs), 'bundle inputs must be an array');
  invariant(bundle.states && typeof bundle.states === 'object' && !Array.isArray(bundle.states), 'bundle states must be an object');
  const actualRoles = Object.keys(bundle.states).sort();
  invariant(JSON.stringify(actualRoles) === JSON.stringify(ROLE_NAMES), 'bundle state roles differ');
  const inputRoles = bundle.inputs.map(row => row.role).sort();
  invariant(JSON.stringify(inputRoles) === JSON.stringify(ROLE_NAMES), 'bundle input roles differ');
  for (const role of ROLE_NAMES) {
    const state = bundle.states[role];
    invariant(state?.kind === EXPECTED_ROLES[role], `${role} kind mismatch`);
    invariant(state.authority === false, `${role} must be non-authority`);
    const input = bundle.inputs.find(row => row.role === role);
    invariant(input?.kind === EXPECTED_ROLES[role], `${role} input kind mismatch`);
    invariant(SHA256.test(input?.digest || ''), `${role} input digest must be exact sha256`);
    string(input?.sourceRef, `${role}.sourceRef`);
  }
  return bundle;
}

function repoLabel(repoId) {
  return repoId.split('/').at(-1);
}

function repoHref(snapshot) {
  return snapshot.sourceRef || `https://github.com/${snapshot.repoId}`;
}

function packageHref(snapshot, packageName) {
  return `https://github.com/${snapshot.repoId}/tree/${snapshot.sourceRev}/${snapshot.packageRoot}/${encodeURIComponent(packageName)}`;
}

function statusPrefix(status) {
  return `[${String(status || 'unknown').toUpperCase()}]`;
}

function layoutRepositories(repositories, packagesByRepo) {
  const columns = 4;
  const pageGap = 44;
  const rootInset = 44;
  const repoWidth = 900;
  const packageColumns = 3;
  const cardWidth = 252;
  const cardHeight = 72;
  const cardGapX = 18;
  const cardGapY = 16;
  const headerHeight = 130;
  const footerHeight = 44;
  const packageInsetX = 48;
  const packageInsetY = 118;
  const repoLayouts = repositories.map(snapshot => {
    const packageCount = packagesByRepo.get(snapshot.repoId)?.length || 0;
    const detailCount = Math.max(1, packageCount || snapshot.requiredPackageExpectationCount || 1);
    const packageRows = Math.ceil(detailCount / packageColumns);
    return {
      repoId: snapshot.repoId,
      height: headerHeight + packageRows * (cardHeight + cardGapY) + footerHeight,
      packageColumns,
      cardWidth,
      cardHeight,
      cardGapX,
      cardGapY,
      packageInsetX,
      packageInsetY,
    };
  });
  const rowHeights = [];
  for (let index = 0; index < repoLayouts.length; index += columns) {
    rowHeights.push(Math.max(...repoLayouts.slice(index, index + columns).map(layout => layout.height)));
  }
  const rowOffsets = [];
  let cursor = rootInset;
  for (const height of rowHeights) {
    rowOffsets.push(cursor);
    cursor += height + pageGap;
  }
  for (const [index, layout] of repoLayouts.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    layout.x = rootInset + column * (repoWidth + pageGap);
    layout.y = rowOffsets[row];
    layout.width = repoWidth;
    layout.height = rowHeights[row];
  }
  return {
    repoLayouts,
    width: rootInset * 2 + columns * repoWidth + (columns - 1) * pageGap,
    height: cursor,
    gap: pageGap,
    inset: rootInset,
  };
}

function eventActor(row) {
  const repoId = row.ownerRepoId || row.repoId;
  return repoId ? `repo:${repoId}` : 'repo:roccho-dev/adrs';
}

export function projectInternalOrganizationBundle({ bundle, profile }) {
  validateProfile(profile);
  validateBundle(bundle);

  const contractGraph = bundle.states.contractGraph;
  const decisionImpact = bundle.states.decisionImpact;
  const obligationState = bundle.states.obligationState;
  const workCurrent = bundle.states.workCurrent;
  const responsibilityClosure = bundle.states.responsibilityClosure;
  const evidenceState = bundle.states.evidenceState;

  const repositories = stable(rows(contractGraph.repositories, 'contractGraph.repositories'));
  const entities = rows(contractGraph.entities, 'contractGraph.entities');
  const packages = stable(entities.filter(row => row.entityKind === 'package'));
  const requirements = stable(entities.filter(row => row.entityKind === 'requirement'));
  const decisions = stable(rows(decisionImpact.decisions, 'decisionImpact.decisions'));
  const obligations = stable(rows(obligationState.rows, 'obligationState.rows'));
  const works = stable(rows(workCurrent.rows, 'workCurrent.rows'));
  const closures = stable(rows(responsibilityClosure.rows, 'responsibilityClosure.rows'));
  const evidences = stable(rows(evidenceState.rows, 'evidenceState.rows'));
  const spines = stable(rows(contractGraph.spines, 'contractGraph.spines'));

  unique(repositories, 'repository');
  unique(packages, 'package');
  unique(requirements, 'requirement');
  unique(decisions, 'decision');
  unique(obligations, 'obligation');
  unique(works, 'work');
  unique(closures, 'closure');
  unique(evidences, 'evidence');
  unique(spines, 'spine');

  invariant(repositories.length > 0, 'repository universe is empty');
  const repoById = new Map(repositories.map(snapshot => {
    invariant(snapshot.kind === 'organizationMap.repositorySnapshot.v1', `${snapshot.id} kind mismatch`);
    invariant(REPO_ID.test(snapshot.repoId || ''), `${snapshot.id} repoId mismatch`);
    invariant(snapshot.id === `repo:${snapshot.repoId}`, `${snapshot.id} stable ID mismatch`);
    invariant(GIT_SHA.test(snapshot.sourceRev || ''), `${snapshot.id} sourceRev must be exact Git SHA`);
    invariant(snapshot.authority === false, `${snapshot.id} must be non-authority`);
    invariant(snapshot.packageCount === snapshot.packages.length, `${snapshot.id} packageCount mismatch`);
    return [snapshot.repoId, snapshot];
  }));
  for (const row of packages) invariant(repoById.has(row.repoId), `${row.id} has unknown repository`);
  for (const row of requirements) invariant(repoById.has(row.repoId), `${row.id} has unknown repository`);

  const packagesByRepo = new Map(repositories.map(row => [row.repoId, []]));
  for (const row of packages) packagesByRepo.get(row.repoId).push(row);
  const requirementsByRepo = new Map(repositories.map(row => [row.repoId, []]));
  for (const row of requirements) requirementsByRepo.get(row.repoId).push(row);
  const layout = layoutRepositories(repositories, packagesByRepo);
  const lifecycleY = layout.height + 24;
  const lifecycleHeight = 360;
  const findingsY = lifecycleY + lifecycleHeight + 44;
  const findingRows = closures.filter(row => row.status !== 'conformant');
  const findingsHeight = Math.max(280, 120 + Math.ceil(findingRows.length / 3) * 120);
  const rootHeight = findingsY + findingsHeight + 52;

  const records = [
    Object.freeze({ type: 'meta', schema: 'semantic-map-state/1', root: profile.root.id, title: profile.root.label }),
    Object.freeze({
      type: 'region', id: profile.root.id, parent: null, label: profile.root.label, kind: 'organization',
      bounds: [0, 0, layout.width, rootHeight],
      summary: `repositories=${repositories.length} · observed packages=${packages.length} · required expectations=${requirements.length} · unresolved closures=${findingRows.length} · authority=false`,
    }),
  ];
  const relationRows = [];

  for (const [index, snapshot] of repositories.entries()) {
    const geometry = layout.repoLayouts[index];
    const packageRows = packagesByRepo.get(snapshot.repoId);
    const requiredRows = requirementsByRepo.get(snapshot.repoId);
    records.push(Object.freeze({
      type: 'region', id: snapshot.id, parent: profile.root.id,
      label: `${statusPrefix(snapshot.inventoryState)} ${repoLabel(snapshot.repoId)}`,
      kind: 'actor', bounds: [geometry.x, geometry.y, geometry.width, geometry.height],
      summary: `${snapshot.repoClass} · inventory=${snapshot.inventoryState} · observed packages=${packageRows.length} · required expectations=${requiredRows.length} · source=${snapshot.sourceRev}`,
      href: repoHref(snapshot), order: index + 1,
    }));
    const groupId = `package-group:${snapshot.repoId}`;
    records.push(Object.freeze({
      type: 'region', id: groupId, parent: snapshot.id,
      label: `packages ${packageRows.length} / required ${requiredRows.length}`,
      kind: 'package-group',
      bounds: [geometry.x + 30, geometry.y + 78, geometry.width - 60, geometry.height - 104],
      summary: snapshot.inventoryState === 'observed'
        ? `Exact ${snapshot.packageRoot}/ directories observed at ${snapshot.sourceRev}.`
        : `Inventory is ${snapshot.inventoryState}; no package is invented. Required expectations stay explicit.`,
    }));
    if (packageRows.length > 0) {
      packageRows.forEach((row, packageIndex) => {
        const column = packageIndex % geometry.packageColumns;
        const packageRow = Math.floor(packageIndex / geometry.packageColumns);
        records.push(Object.freeze({
          type: 'region', id: row.id, parent: groupId, label: row.label, kind: 'package',
          bounds: [
            geometry.x + geometry.packageInsetX + column * (geometry.cardWidth + geometry.cardGapX),
            geometry.y + geometry.packageInsetY + packageRow * (geometry.cardHeight + geometry.cardGapY),
            geometry.cardWidth,
            geometry.cardHeight,
          ],
          summary: `${snapshot.repoId}/${snapshot.packageRoot}/${row.label}\nstatus=${row.status} · source=${snapshot.sourceRev} · authority=false`,
          href: packageHref(snapshot, row.label), order: packageIndex + 1,
        }));
        relationRows.push(Object.freeze({
          type: 'relation', id: `contains:${snapshot.id}:${row.id}`, from: snapshot.id, to: row.id,
          kind: 'contains', label: 'contains',
        }));
      });
    } else {
      const inventoryId = `finding:${snapshot.repoId}:inventory-${snapshot.inventoryState}`;
      records.push(Object.freeze({
        type: 'region', id: inventoryId, parent: groupId,
        label: `${statusPrefix(snapshot.inventoryState)} package inventory`, kind: 'finding',
        bounds: [geometry.x + 66, geometry.y + 126, geometry.width - 132, 84],
        summary: `No package row is fabricated. Required package expectations: ${snapshot.requiredPackageExpectations.join(', ') || 'none'}.`,
        href: snapshot.requiredContractRef,
      }));
      relationRows.push(Object.freeze({
        type: 'relation', id: `reveals:${snapshot.id}:${inventoryId}`, from: snapshot.id, to: inventoryId,
        kind: 'reveals', label: 'inventory gap',
      }));
    }
  }

  const eventRows = [
    ...decisions.map(row => ({ ...row, eventKind: 'decision', actor: 'repo:roccho-dev/adrs', label: row.title })),
    ...obligations.map(row => ({ ...row, eventKind: 'obligation', actor: eventActor(row), label: row.title })),
    ...works.map(row => ({ ...row, eventKind: 'work', actor: eventActor(row), label: row.id })),
    ...evidences.map(row => ({ ...row, eventKind: 'evidence', actor: eventActor(row), label: row.outputIdentity || row.id })),
  ];
  const eventById = new Map(eventRows.map(row => [row.id, row]));
  const spineSteps = spines.flatMap(spine => spine.steps.map((step, index) => ({ ...step, spineId: spine.id, index })));
  for (const step of spineSteps) {
    for (const endpoint of [step.from, step.to]) {
      if (!eventById.has(endpoint) && !packages.some(row => row.id === endpoint) && !requirements.some(row => row.id === endpoint)) {
        eventById.set(endpoint, {
          id: endpoint, eventKind: endpoint.startsWith('receipt:') ? 'evidence' : 'reference',
          actor: endpoint.startsWith('receipt:') ? 'repo:roccho-dev/ops' : 'repo:roccho-dev/governance',
          label: endpoint, status: 'referenced', sourceRef: bundle.decisionRef,
        });
      }
    }
  }
  const orderedEvents = [...eventById.values()].sort((left, right) => left.id.localeCompare(right.id, 'en'));
  const ordinalById = new Map();
  let ordinal = 0;
  for (const step of spineSteps) {
    if (!ordinalById.has(step.from)) ordinalById.set(step.from, ordinal++);
    if (!ordinalById.has(step.to)) ordinalById.set(step.to, ordinal++);
  }
  for (const event of orderedEvents) if (!ordinalById.has(event.id)) ordinalById.set(event.id, ordinal++);

  records.push(Object.freeze({
    type: 'region', id: 'lifecycle:adrs-331', parent: profile.root.id,
    label: 'decision → obligation → factory → projection → delivery → readback', kind: 'lifecycle',
    bounds: [layout.inset, lifecycleY, layout.width - layout.inset * 2, lifecycleHeight],
    summary: 'Same event IDs drive map/1, graph/1, and seq/1. Result/evidence does not self-authorize closure.',
  }));
  const eventWidth = Math.max(260, Math.floor((layout.width - 160) / Math.max(1, orderedEvents.length)) - 20);
  for (const [index, event] of orderedEvents.entries()) {
    const actor = event.actor || 'repo:roccho-dev/governance';
    invariant(records.some(row => row.id === actor), `${event.id} actor ${actor} is absent`);
    records.push(Object.freeze({
      type: 'region', id: event.id, parent: 'lifecycle:adrs-331',
      label: `${statusPrefix(event.status)} ${event.label}`, kind: event.eventKind,
      bounds: [80 + index * (eventWidth + 16), lifecycleY + 108, eventWidth, 128],
      summary: `${event.eventKind} · status=${event.status || 'unknown'} · authority=false`,
      href: event.sourceRef || event.decisionRef || bundle.decisionRef,
      temporal: { actor, ordinal: { start: ordinalById.get(event.id), end: ordinalById.get(event.id) } },
      order: index + 1,
    }));
  }

  records.push(Object.freeze({
    type: 'region', id: 'findings:responsibility-closure', parent: profile.root.id,
    label: 'required package expectations and unresolved closure', kind: 'finding-group',
    bounds: [layout.inset, findingsY, layout.width - layout.inset * 2, findingsHeight],
    summary: 'Unknown, missing, drift, conflict, waived, orphan, retired, and residual states remain visible.',
  }));
  for (const [index, closure] of findingRows.entries()) {
    const column = index % 3;
    const rowIndex = Math.floor(index / 3);
    const width = Math.floor((layout.width - 220) / 3);
    records.push(Object.freeze({
      type: 'region', id: closure.id, parent: 'findings:responsibility-closure',
      label: `${statusPrefix(closure.status)} ${closure.expectation}`, kind: 'finding',
      bounds: [80 + column * (width + 30), findingsY + 92 + rowIndex * 116, width, 88],
      summary: `${closure.repoId} · expectation=${closure.expectation} · status=${closure.status} · matched=${closure.matchedPackageIds.join(', ') || 'none'}`,
      href: repoById.get(closure.repoId)?.requiredContractRef || bundle.decisionRef,
      order: index + 1,
    }));
    const repoRegionId = `repo:${closure.repoId}`;
    relationRows.push(Object.freeze({
      type: 'relation', id: `closure:${repoRegionId}:${closure.id}`, from: repoRegionId, to: closure.id,
      kind: 'requires', label: closure.status,
    }));
  }

  const existingIds = new Set(records.filter(row => row.type === 'region').map(row => row.id));
  for (const requirement of requirements) {
    if (!existingIds.has(requirement.id)) {
      const closure = closures.find(row => row.repoId === requirement.repoId && row.expectation === requirement.label);
      records.push(Object.freeze({
        type: 'region', id: requirement.id, parent: 'findings:responsibility-closure',
        label: `${statusPrefix(closure?.status)} ${requirement.label}`, kind: 'requirement',
        bounds: [layout.inset, findingsY + findingsHeight - 4, 1, 1],
        summary: `${requirement.repoId} · required by ${requirement.contractRef} · status=${closure?.status || 'unknown'}`,
        href: requirement.contractRef,
      }));
      existingIds.add(requirement.id);
    }
  }

  for (const step of spineSteps) {
    invariant(existingIds.has(step.from), `${step.spineId} missing from endpoint ${step.from}`);
    invariant(existingIds.has(step.to), `${step.spineId} missing to endpoint ${step.to}`);
    relationRows.push(Object.freeze({
      type: 'relation', id: `spine:${step.spineId}:${step.index}`, from: step.from, to: step.to,
      kind: step.label, label: step.label,
    }));
  }
  unique(relationRows, 'relation');
  records.push(...relationRows);

  return Object.freeze({
    schema: 'ui.semanticMapProjection/1',
    profileId: profile.profileId,
    authority: false,
    generatedArtifactsAreAuthority: false,
    mapId: 'urn:roccho-dev:internal-organization-map:1',
    records: Object.freeze(records),
    view: Object.freeze(profile.view),
    counts: Object.freeze({
      repositories: repositories.length,
      packages: packages.length,
      requirements: requirements.length,
      unresolvedClosures: findingRows.length,
      events: orderedEvents.length,
      regions: records.filter(row => row.type === 'region').length,
      relations: relationRows.length,
    }),
    input: Object.freeze({
      decisionRef: bundle.decisionRef,
      inputDigest: bundle.inputDigest,
      semanticDigest: bundle.semanticDigest,
      sourceRefs: Object.freeze(bundle.inputs.map(row => row.sourceRef).sort()),
    }),
  });
}

export async function loadAndProject({ bundlePath, profilePath }) {
  const bundle = JSON.parse(await fs.readFile(bundlePath, 'utf8'));
  const profiles = parseJsonl(await fs.readFile(profilePath, 'utf8'), 'profile');
  invariant(profiles.length === 1, 'profile JSONL must contain exactly one row');
  return projectInternalOrganizationBundle({ bundle, profile: profiles[0] });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const args = Object.fromEntries(process.argv.slice(2).map(argument => {
    const index = argument.indexOf('=');
    invariant(argument.startsWith('--') && index >= 3, `expected --name=value, got ${argument}`);
    return [argument.slice(2, index), argument.slice(index + 1)];
  }));
  for (const name of ['bundle', 'profile', 'out']) invariant(args[name], `--${name} is required`);
  const projection = await loadAndProject({ bundlePath: args.bundle, profilePath: args.profile });
  await fs.mkdir(path.dirname(path.resolve(args.out)), { recursive: true });
  await fs.writeFile(args.out, `${JSON.stringify(projection, null, 2)}\n`);
  console.log(JSON.stringify({ status: 'PASS', profileId: projection.profileId, mapId: projection.mapId, ...projection.counts }));
}
