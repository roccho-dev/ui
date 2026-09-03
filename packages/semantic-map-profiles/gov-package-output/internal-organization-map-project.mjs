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
const REPOSITORY_ORDER = Object.freeze([
  'roccho-dev/adrs',
  'roccho-dev/governance',
  'roccho-dev/hq',
  'roccho-dev/ops',
  'roccho-dev/ui',
  'roccho-dev/edits',
  'roccho-dev/diagrams',
  'roccho-dev/envs',
]);
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

function array(value, label) {
  invariant(Array.isArray(value), `${label} must be an array`);
  return value;
}

function stable(values) {
  return [...values].sort((left, right) => left.id.localeCompare(right.id, 'en'));
}

function unique(values, label) {
  const result = new Map();
  for (const value of values) {
    const id = string(value?.id, `${label}.id`);
    invariant(!result.has(id), `duplicate ${label} id ${id}`);
    result.set(id, value);
  }
  return result;
}

function exactStrings(value, label) {
  const values = array(value, label);
  invariant(values.every(item => typeof item === 'string' && item.length > 0), `${label} must be string[]`);
  invariant(JSON.stringify(values) === JSON.stringify([...new Set(values)].sort()), `${label} must be sorted and unique`);
  return values;
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
  invariant(profile.root?.id === 'organization:roccho-dev:control-surface', 'profile root mismatch');
  invariant(profile.view?.pattern === 'map/1', 'profile must open in map/1');
  return profile;
}

function validateBundle(bundle) {
  invariant(bundle?.kind === 'controlSurface.bundle.v1', 'bundle kind mismatch');
  invariant(bundle.authority === false, 'bundle must be non-authority');
  invariant(bundle.decisionRef === 'https://github.com/roccho-dev/adrs/issues/331', 'bundle decisionRef mismatch');
  invariant(SHA256.test(bundle.inputDigest || ''), 'bundle inputDigest must be exact sha256');
  invariant(SHA256.test(bundle.semanticDigest || ''), 'bundle semanticDigest must be exact sha256');
  invariant(bundle.states && typeof bundle.states === 'object' && !Array.isArray(bundle.states), 'bundle states must be an object');
  invariant(Array.isArray(bundle.inputs), 'bundle inputs must be an array');

  const stateRoles = Object.keys(bundle.states).sort();
  invariant(JSON.stringify(stateRoles) === JSON.stringify(ROLE_NAMES), 'bundle state roles differ');
  const inputByRole = new Map();
  for (const input of bundle.inputs) {
    const role = string(input?.role, 'bundle.inputs.role');
    invariant(!inputByRole.has(role), `duplicate bundle input role ${role}`);
    inputByRole.set(role, input);
  }
  invariant(JSON.stringify([...inputByRole.keys()].sort()) === JSON.stringify(ROLE_NAMES), 'bundle input roles differ');

  const sourceDigests = new Set();
  for (const role of ROLE_NAMES) {
    const state = bundle.states[role];
    const input = inputByRole.get(role);
    invariant(state?.kind === EXPECTED_ROLES[role], `${role} kind mismatch`);
    invariant(state.authority === false, `${role} must be non-authority`);
    invariant(SHA256.test(state.sourceDigest || ''), `${role}.sourceDigest must be exact sha256`);
    sourceDigests.add(state.sourceDigest);
    invariant(input.kind === EXPECTED_ROLES[role], `${role} input kind mismatch`);
    invariant(SHA256.test(input.digest || ''), `${role} input digest must be exact sha256`);
    string(input.sourceRef, `${role}.sourceRef`);
  }
  invariant(sourceDigests.size === 1, 'current-state lanes have different source digests');
  return bundle;
}

function statusPrefix(status) {
  return `[${String(status || 'unknown').toUpperCase()}]`;
}

function repoLabel(repoId) {
  return repoId.split('/').at(-1);
}

function packageHref(snapshot, packageId) {
  return `${snapshot.sourceRef}/${snapshot.packageRoot}/${encodeURIComponent(packageId)}`;
}

function actorFor(row) {
  const repoId = row.ownerRepoId || row.repoId;
  return `repo:${repoId || 'roccho-dev/adrs'}`;
}

function validateCurrentWorld(bundle) {
  const contractGraph = bundle.states.contractGraph;
  const repositories = array(contractGraph.repositories, 'contractGraph.repositories');
  const entities = array(contractGraph.entities, 'contractGraph.entities');
  const decisions = array(bundle.states.decisionImpact.decisions, 'decisionImpact.decisions');
  const obligations = array(bundle.states.obligationState.rows, 'obligationState.rows');
  const works = array(bundle.states.workCurrent.rows, 'workCurrent.rows');
  const closures = array(bundle.states.responsibilityClosure.rows, 'responsibilityClosure.rows');
  const evidences = array(bundle.states.evidenceState.rows, 'evidenceState.rows');
  const spines = array(contractGraph.spines, 'contractGraph.spines');

  const repositoryById = unique(repositories, 'repository');
  const packageById = unique(entities.filter(row => row.entityKind === 'package'), 'package');
  const requirementById = unique(
    entities.filter(row => row.entityKind === 'required-package-expectation'),
    'required package expectation',
  );
  const decisionById = unique(decisions, 'decision');
  const obligationById = unique(obligations, 'obligation');
  const workById = unique(works, 'work');
  const closureById = unique(closures, 'responsibility closure');
  const evidenceById = unique(evidences, 'evidence');
  const spineById = unique(spines, 'factory spine');

  invariant(
    JSON.stringify([...repositoryById.values()].map(row => row.repoId).sort())
      === JSON.stringify([...REPOSITORY_ORDER].sort()),
    'bounded repository universe differs',
  );

  const repositoryByRepoId = new Map();
  for (const snapshot of repositoryById.values()) {
    invariant(snapshot.kind === 'organizationMap.repositorySnapshot.v1', `${snapshot.id} kind mismatch`);
    invariant(REPO_ID.test(snapshot.repoId || ''), `${snapshot.id} repoId mismatch`);
    invariant(snapshot.id === `repo:${snapshot.repoId}`, `${snapshot.id} stable ID mismatch`);
    invariant(GIT_SHA.test(snapshot.sourceRev || ''), `${snapshot.id} sourceRev must be exact Git SHA`);
    invariant(snapshot.authority === false, `${snapshot.id} must be non-authority`);
    invariant(['observed', 'unknown'].includes(snapshot.inventoryState), `${snapshot.id} inventoryState mismatch`);
    const packageNames = exactStrings(snapshot.packages, `${snapshot.id}.packages`);
    const expectations = exactStrings(snapshot.requiredPackageExpectations, `${snapshot.id}.requiredPackageExpectations`);
    invariant(snapshot.packageCount === packageNames.length, `${snapshot.id} packageCount mismatch`);
    invariant(snapshot.requiredPackageExpectationCount === expectations.length, `${snapshot.id} expectation count mismatch`);
    invariant(snapshot.inventoryState !== 'unknown' || packageNames.length === 0, `${snapshot.id} unknown inventory contains packages`);
    repositoryByRepoId.set(snapshot.repoId, snapshot);
  }

  const packagesByRepo = new Map(REPOSITORY_ORDER.map(repoId => [repoId, []]));
  for (const row of packageById.values()) {
    const snapshot = repositoryByRepoId.get(row.repoId);
    invariant(snapshot, `${row.id} has unknown repository`);
    invariant(row.id === `package:${row.repoId}:${row.packageId}`, `${row.id} stable package ID mismatch`);
    invariant(row.packagePath === `${snapshot.packageRoot}/${row.packageId}`, `${row.id} packagePath mismatch`);
    invariant(row.sourceRev === snapshot.sourceRev, `${row.id} source revision mismatch`);
    invariant(row.authority === false, `${row.id} must be non-authority`);
    packagesByRepo.get(row.repoId).push(row);
  }

  const requirementsByRepo = new Map(REPOSITORY_ORDER.map(repoId => [repoId, []]));
  for (const row of requirementById.values()) {
    const snapshot = repositoryByRepoId.get(row.repoId);
    invariant(snapshot, `${row.id} has unknown repository`);
    invariant(row.id === `requirement:${row.repoId}:${row.packageId}`, `${row.id} stable requirement ID mismatch`);
    invariant(row.contractRef === snapshot.requiredContractRef, `${row.id} contractRef mismatch`);
    invariant(row.contractState === 'proposed-target', `${row.id} contractState mismatch`);
    invariant(['observed-match', 'missing-or-unmatched'].includes(row.status), `${row.id} status mismatch`);
    invariant(row.authority === false, `${row.id} must be non-authority`);
    requirementsByRepo.get(row.repoId).push(row);
  }

  for (const repoId of REPOSITORY_ORDER) {
    const snapshot = repositoryByRepoId.get(repoId);
    const observed = packagesByRepo.get(repoId).map(row => row.packageId).sort();
    const expected = requirementsByRepo.get(repoId).map(row => row.packageId).sort();
    invariant(JSON.stringify(observed) === JSON.stringify(snapshot.packages), `${repoId} package rows differ from snapshot`);
    invariant(JSON.stringify(expected) === JSON.stringify(snapshot.requiredPackageExpectations), `${repoId} requirement rows differ from snapshot`);
  }

  const closureByRepo = new Map();
  for (const row of closureById.values()) {
    const snapshot = repositoryByRepoId.get(row.repoId);
    invariant(snapshot, `${row.id} has unknown repository`);
    invariant(row.id === `closure:repo:${row.repoId}`, `${row.id} stable closure ID mismatch`);
    invariant(row.inventoryState === snapshot.inventoryState, `${row.id} inventory state mismatch`);
    invariant(row.observedPackageCount === snapshot.packageCount, `${row.id} observed count mismatch`);
    invariant(row.requiredExpectationCount === snapshot.requiredPackageExpectationCount, `${row.id} expectation count mismatch`);
    invariant(row.status === (snapshot.inventoryState === 'observed' ? 'observed' : 'unknown'), `${row.id} status mismatch`);
    invariant(row.authority === false, `${row.id} must be non-authority`);
    invariant(!closureByRepo.has(row.repoId), `duplicate closure repository ${row.repoId}`);
    closureByRepo.set(row.repoId, row);
  }
  invariant(closureByRepo.size === REPOSITORY_ORDER.length, 'one closure row per repository is required');

  for (const row of decisionById.values()) invariant(row.authority === false, `${row.id} must be non-authority`);
  for (const row of obligationById.values()) {
    invariant(repositoryByRepoId.has(row.ownerRepoId), `${row.id} owner repository is absent`);
    invariant(decisionById.has(row.decisionId), `${row.id} decision is absent`);
    invariant(row.authority === false, `${row.id} must be non-authority`);
  }
  for (const row of workById.values()) {
    invariant(repositoryByRepoId.has(row.repoId), `${row.id} repository is absent`);
    invariant(row.authority === false, `${row.id} must be non-authority`);
  }
  for (const row of evidenceById.values()) {
    invariant(repositoryByRepoId.has(row.repoId), `${row.id} repository is absent`);
    invariant(row.authority === false, `${row.id} must be non-authority`);
  }

  const endpointIds = new Set([
    ...repositoryById.keys(),
    ...packageById.keys(),
    ...requirementById.keys(),
    ...decisionById.keys(),
    ...obligationById.keys(),
    ...workById.keys(),
    ...closureById.keys(),
    ...evidenceById.keys(),
  ]);
  for (const spine of spineById.values()) {
    for (const [index, step] of array(spine.steps, `${spine.id}.steps`).entries()) {
      string(step?.label, `${spine.id}.steps[${index}].label`);
      invariant(endpointIds.has(step?.from), `${spine.id}.steps[${index}] missing from endpoint ${step?.from}`);
      invariant(endpointIds.has(step?.to), `${spine.id}.steps[${index}] missing to endpoint ${step?.to}`);
    }
  }

  return {
    repositoryByRepoId,
    packagesByRepo,
    requirementsByRepo,
    decisions: stable([...decisionById.values()]),
    obligations: stable([...obligationById.values()]),
    works: stable([...workById.values()]),
    closures: stable([...closureById.values()]),
    evidences: stable([...evidenceById.values()]),
    spines: stable([...spineById.values()]),
  };
}

function repositoryLayout(world) {
  const columns = 4;
  const rootInset = 46;
  const columnGap = 44;
  const rowGap = 44;
  const repoWidth = 920;
  const cardColumns = 3;
  const cardWidth = 264;
  const cardHeight = 78;
  const cardGapX = 18;
  const cardGapY = 16;
  const header = 132;
  const footer = 40;
  const layouts = REPOSITORY_ORDER.map(repoId => {
    const snapshot = world.repositoryByRepoId.get(repoId);
    const details = world.packagesByRepo.get(repoId).length
      + world.requirementsByRepo.get(repoId).length
      + (snapshot.inventoryState === 'unknown' ? 1 : 0);
    const cardRows = Math.max(1, Math.ceil(details / cardColumns));
    return {
      repoId,
      width: repoWidth,
      contentHeight: header + cardRows * (cardHeight + cardGapY) + footer,
      cardColumns,
      cardWidth,
      cardHeight,
      cardGapX,
      cardGapY,
    };
  });
  const rowHeights = [];
  for (let index = 0; index < layouts.length; index += columns) {
    rowHeights.push(Math.max(...layouts.slice(index, index + columns).map(row => row.contentHeight)));
  }
  const rowTops = [];
  let cursor = rootInset;
  for (const height of rowHeights) {
    rowTops.push(cursor);
    cursor += height + rowGap;
  }
  layouts.forEach((layout, index) => {
    layout.x = rootInset + (index % columns) * (repoWidth + columnGap);
    layout.y = rowTops[Math.floor(index / columns)];
    layout.height = rowHeights[Math.floor(index / columns)];
  });
  return {
    layouts,
    byRepo: new Map(layouts.map(row => [row.repoId, row])),
    width: rootInset * 2 + columns * repoWidth + (columns - 1) * columnGap,
    height: cursor,
    inset: rootInset,
  };
}

function pushRelation(relations, relation) {
  relations.push(Object.freeze({ type: 'relation', ...relation }));
}

export function projectInternalOrganizationBundle({ bundle, profile }) {
  validateProfile(profile);
  validateBundle(bundle);
  const world = validateCurrentWorld(bundle);
  const layout = repositoryLayout(world);
  const unresolvedRequirements = stable(
    [...world.requirementsByRepo.values()].flat().filter(row => row.status !== 'observed-match'),
  );
  const unknownClosures = world.closures.filter(row => row.status !== 'observed');
  const lifecycleEvents = [
    ...world.decisions.map(row => ({ ...row, eventKind: 'decision', actor: 'repo:roccho-dev/adrs', label: row.title })),
    ...world.obligations.map(row => ({ ...row, eventKind: 'obligation', actor: actorFor(row), label: row.title })),
    ...world.works.map(row => ({ ...row, eventKind: 'work', actor: actorFor(row), label: row.id })),
    ...world.evidences.map(row => ({ ...row, eventKind: 'evidence', actor: actorFor(row), label: row.id })),
  ];
  const eventById = unique(lifecycleEvents, 'lifecycle event');
  const spineSteps = world.spines.flatMap(spine => spine.steps.map((step, index) => ({ ...step, spineId: spine.id, index })));
  const order = new Map();
  let ordinal = 0;
  for (const step of spineSteps) {
    if (eventById.has(step.from) && !order.has(step.from)) order.set(step.from, ordinal++);
    if (eventById.has(step.to) && !order.has(step.to)) order.set(step.to, ordinal++);
  }
  for (const event of stable([...eventById.values()])) if (!order.has(event.id)) order.set(event.id, ordinal++);
  const orderedEvents = [...eventById.values()].sort((left, right) => order.get(left.id) - order.get(right.id));

  const lifecycleColumns = 6;
  const lifecycleRows = Math.max(1, Math.ceil(orderedEvents.length / lifecycleColumns));
  const lifecycleHeight = 124 + lifecycleRows * 126;
  const lifecycleY = layout.height + 24;
  const findings = [
    ...unresolvedRequirements.map(row => ({
      id: `finding:${row.id}`,
      subjectId: row.id,
      repoId: row.repoId,
      status: row.status,
      label: `required · ${row.packageId}`,
      summary: `${row.repoId} · required by ${row.contractRef} · status=${row.status}`,
      href: row.contractRef,
    })),
    ...unknownClosures.map(row => ({
      id: `finding:${row.id}`,
      subjectId: `repo:${row.repoId}`,
      repoId: row.repoId,
      status: row.status,
      label: 'package inventory',
      summary: `${row.repoId} · inventory=${row.inventoryState} · observed packages=${row.observedPackageCount} · required expectations=${row.requiredExpectationCount}`,
      href: world.repositoryByRepoId.get(row.repoId).requiredContractRef,
    })),
  ].sort((left, right) => left.id.localeCompare(right.id, 'en'));
  const findingColumns = 3;
  const findingRows = Math.max(1, Math.ceil(findings.length / findingColumns));
  const findingsY = lifecycleY + lifecycleHeight + 38;
  const findingsHeight = 122 + findingRows * 108;
  const rootHeight = findingsY + findingsHeight + 48;

  const records = [
    Object.freeze({ type: 'meta', schema: 'semantic-map-state/1', root: profile.root.id, title: profile.root.label }),
    Object.freeze({
      type: 'region',
      id: profile.root.id,
      parent: null,
      label: profile.root.label,
      kind: 'organization',
      bounds: [0, 0, layout.width, rootHeight],
      summary: `repositories=${REPOSITORY_ORDER.length} · observed packages=${[...world.packagesByRepo.values()].flat().length} · required expectations=${[...world.requirementsByRepo.values()].flat().length} · inventory unknown=${unknownClosures.length} · unresolved requirements=${unresolvedRequirements.length} · authority=false`,
      href: bundle.decisionRef,
    }),
  ];
  const relations = [];

  for (const [repoIndex, repoId] of REPOSITORY_ORDER.entries()) {
    const snapshot = world.repositoryByRepoId.get(repoId);
    const geometry = layout.byRepo.get(repoId);
    const packages = stable(world.packagesByRepo.get(repoId));
    const requirements = stable(world.requirementsByRepo.get(repoId));
    records.push(Object.freeze({
      type: 'region',
      id: snapshot.id,
      parent: profile.root.id,
      label: `${statusPrefix(snapshot.inventoryState)} ${repoLabel(repoId)}`,
      kind: 'actor',
      bounds: [geometry.x, geometry.y, geometry.width, geometry.height],
      summary: `${snapshot.repoClass} · inventory=${snapshot.inventoryState} · observed packages=${packages.length} · required expectations=${requirements.length} · source=${snapshot.sourceRev}`,
      href: snapshot.sourceRef,
      order: repoIndex + 1,
    }));
    const groupId = `package-group:${repoId}`;
    records.push(Object.freeze({
      type: 'region',
      id: groupId,
      parent: snapshot.id,
      label: `packages ${packages.length} / required ${requirements.length}`,
      kind: 'package-group',
      bounds: [geometry.x + 28, geometry.y + 78, geometry.width - 56, geometry.height - 102],
      summary: snapshot.inventoryState === 'observed'
        ? `Exact ${snapshot.packageRoot}/ directories observed at ${snapshot.sourceRev}.`
        : 'Repository is observed; package inventory remains explicit unknown. No package is fabricated.',
    }));

    const cards = [
      ...packages.map(row => ({ cardKind: 'package', row })),
      ...requirements.map(row => ({ cardKind: 'requirement', row })),
      ...(snapshot.inventoryState === 'unknown'
        ? [{ cardKind: 'inventory-gap', row: { id: `finding:${repoId}:inventory-unknown` } }]
        : []),
    ];
    cards.forEach((card, cardIndex) => {
      const column = cardIndex % geometry.cardColumns;
      const rowIndex = Math.floor(cardIndex / geometry.cardColumns);
      const bounds = [
        geometry.x + 50 + column * (geometry.cardWidth + geometry.cardGapX),
        geometry.y + 126 + rowIndex * (geometry.cardHeight + geometry.cardGapY),
        geometry.cardWidth,
        geometry.cardHeight,
      ];
      if (card.cardKind === 'package') {
        const row = card.row;
        records.push(Object.freeze({
          type: 'region', id: row.id, parent: groupId, label: row.packageId, kind: 'package', bounds,
          summary: `${row.packagePath} · status=${row.status} · source=${row.sourceRev} · authority=false`,
          href: row.sourceRef || packageHref(snapshot, row.packageId), order: cardIndex + 1,
        }));
        pushRelation(relations, {
          id: `contains:${snapshot.id}:${row.id}`, from: snapshot.id, to: row.id, kind: 'contains', label: 'contains',
        });
      } else if (card.cardKind === 'requirement') {
        const row = card.row;
        records.push(Object.freeze({
          type: 'region', id: row.id, parent: groupId,
          label: `${statusPrefix(row.status)} required · ${row.packageId}`,
          kind: 'requirement', bounds,
          summary: `target=${row.packageId} · contract=${row.contractState} · status=${row.status} · authority=false`,
          href: row.contractRef, order: cardIndex + 1,
        }));
        pushRelation(relations, {
          id: `requires:${snapshot.id}:${row.id}`, from: snapshot.id, to: row.id, kind: 'requires', label: 'requires',
        });
        if (row.status === 'observed-match') {
          const packageId = `package:${row.repoId}:${row.packageId}`;
          pushRelation(relations, {
            id: `matches:${row.id}:${packageId}`, from: row.id, to: packageId, kind: 'matches', label: 'matches',
          });
        }
      } else {
        records.push(Object.freeze({
          type: 'region', id: card.row.id, parent: groupId,
          label: '[UNKNOWN] package inventory', kind: 'finding', bounds,
          summary: `No top-level ${snapshot.packageRoot}/ inventory was observed. The repository remains visible and is not marked Green.`,
          href: snapshot.requiredContractRef, order: cardIndex + 1,
        }));
        pushRelation(relations, {
          id: `reveals:${snapshot.id}:${card.row.id}`, from: snapshot.id, to: card.row.id, kind: 'reveals', label: 'inventory unknown',
        });
      }
    });
  }

  records.push(Object.freeze({
    type: 'region',
    id: 'lifecycle:adrs-331',
    parent: profile.root.id,
    label: 'decision → obligation → factory → projection → delivery → readback',
    kind: 'lifecycle',
    bounds: [layout.inset, lifecycleY, layout.width - layout.inset * 2, lifecycleHeight],
    summary: 'The same semantic IDs drive map/1, graph/1, and seq/1. Evidence does not self-authorize closure.',
  }));
  const eventGap = 20;
  const eventWidth = Math.floor((layout.width - layout.inset * 2 - 80 - eventGap * (lifecycleColumns - 1)) / lifecycleColumns);
  for (const [index, event] of orderedEvents.entries()) {
    const actor = event.actor || actorFor(event);
    invariant(REPOSITORY_ORDER.some(repoId => `repo:${repoId}` === actor), `${event.id} actor ${actor} is absent`);
    const column = index % lifecycleColumns;
    const rowIndex = Math.floor(index / lifecycleColumns);
    records.push(Object.freeze({
      type: 'region',
      id: event.id,
      parent: 'lifecycle:adrs-331',
      label: `${statusPrefix(event.status)} ${event.label}`,
      kind: event.eventKind,
      bounds: [layout.inset + 40 + column * (eventWidth + eventGap), lifecycleY + 88 + rowIndex * 126, eventWidth, 98],
      summary: `${event.eventKind} · status=${event.status || 'unknown'} · authority=false`,
      href: event.sourceRef || event.decisionRef || bundle.decisionRef,
      temporal: { actor, ordinal: { start: order.get(event.id), end: order.get(event.id) } },
      order: index + 1,
    }));
  }

  records.push(Object.freeze({
    type: 'region',
    id: 'findings:organization-map',
    parent: profile.root.id,
    label: 'explicit gaps and unmatched requirements',
    kind: 'finding-group',
    bounds: [layout.inset, findingsY, layout.width - layout.inset * 2, findingsHeight],
    summary: 'Unknown and missing-or-unmatched states remain visible. They are never reduced to Green by omission.',
  }));
  const findingWidth = Math.floor((layout.width - layout.inset * 2 - 80 - 24 * (findingColumns - 1)) / findingColumns);
  findings.forEach((finding, index) => {
    const column = index % findingColumns;
    const rowIndex = Math.floor(index / findingColumns);
    records.push(Object.freeze({
      type: 'region',
      id: finding.id,
      parent: 'findings:organization-map',
      label: `${statusPrefix(finding.status)} ${finding.label}`,
      kind: 'finding',
      bounds: [layout.inset + 40 + column * (findingWidth + 24), findingsY + 86 + rowIndex * 108, findingWidth, 82],
      summary: finding.summary,
      href: finding.href,
      order: index + 1,
    }));
    pushRelation(relations, {
      id: `finding-link:${finding.subjectId}:${finding.id}`,
      from: finding.subjectId,
      to: finding.id,
      kind: 'reveals',
      label: finding.status,
    });
  });

  for (const spine of world.spines) {
    spine.steps.forEach((step, index) => {
      pushRelation(relations, {
        id: `spine:${spine.id}:${index}`,
        from: step.from,
        to: step.to,
        kind: step.label,
        label: step.label,
      });
    });
  }

  const regionIds = new Set(records.filter(row => row.type === 'region').map(row => row.id));
  unique(relations, 'relation');
  for (const relation of relations) {
    invariant(regionIds.has(relation.from), `${relation.id} from endpoint ${relation.from} is absent`);
    invariant(regionIds.has(relation.to), `${relation.id} to endpoint ${relation.to} is absent`);
  }
  records.push(...relations);

  return Object.freeze({
    schema: 'ui.semanticMapProjection/1',
    profileId: profile.profileId,
    authority: false,
    generatedArtifactsAreAuthority: false,
    mapId: 'urn:roccho-dev:internal-organization-map:1',
    records: Object.freeze(records),
    view: Object.freeze(profile.view),
    counts: Object.freeze({
      repositories: REPOSITORY_ORDER.length,
      packages: [...world.packagesByRepo.values()].flat().length,
      requirements: [...world.requirementsByRepo.values()].flat().length,
      inventoryUnknown: unknownClosures.length,
      unresolvedRequirements: unresolvedRequirements.length,
      events: orderedEvents.length,
      regions: records.filter(row => row.type === 'region').length,
      relations: relations.length,
    }),
    input: Object.freeze({
      decisionRef: bundle.decisionRef,
      inputDigest: bundle.inputDigest,
      semanticDigest: bundle.semanticDigest,
      sourceDigest: bundle.states.contractGraph.sourceDigest,
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
