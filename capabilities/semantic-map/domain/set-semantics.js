function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-set: ${message}`);
}

function relationKey(left, right) {
  return `${left}\u0000${right}`;
}

function splitKey(value) {
  return value.split('\u0000');
}

function pairKey(left, right) {
  return left < right ? relationKey(left, right) : relationKey(right, left);
}

function isSubset(left, right) {
  for (const member of left) if (!right.has(member)) return false;
  return true;
}

function intersection(left, right) {
  return [...left].filter((member) => right.has(member)).sort();
}

function transitiveClosure(ids, direct) {
  const adjacency = new Map(ids.map((id) => [id, new Set([id])]));
  for (const key of direct) {
    const [left, right] = splitKey(key);
    invariant(adjacency.has(left) && adjacency.has(right), `subset relation must reference sets: ${left} -> ${right}`);
    adjacency.get(left).add(right);
  }
  const closure = new Set();
  for (const source of ids) {
    const pending = [...adjacency.get(source)];
    const reached = new Set();
    while (pending.length) {
      const current = pending.pop();
      if (reached.has(current)) continue;
      reached.add(current);
      for (const next of adjacency.get(current)) pending.push(next);
    }
    for (const target of reached) closure.add(relationKey(source, target));
  }
  return closure;
}

export const SET_TOPOLOGIES = Object.freeze([
  'equal',
  'subset',
  'superset',
  'partial-overlap',
  'disjoint',
  'unknown',
]);

export function deriveSetSemantics(domain) {
  invariant(domain?.regions instanceof Map && Array.isArray(domain?.relations), 'domain is required');
  const sets = new Map();
  for (const region of domain.regions.values()) {
    if (region.kind !== 'set') continue;
    sets.set(region.id, {
      id: region.id,
      complete: region.set?.complete === true,
      directMembers: new Set(),
      members: new Set(),
    });
  }

  const directSubset = new Set();
  const directDisjoint = new Set();
  const directOverlap = new Set();
  for (const relation of domain.relations) {
    if (relation.kind === 'memberOf') {
      invariant(sets.has(relation.to), `memberOf target must be a set: ${relation.to}`);
      sets.get(relation.to).directMembers.add(relation.from);
    } else if (relation.kind === 'subsetOf') {
      invariant(sets.has(relation.from) && sets.has(relation.to), `subset relation must reference sets: ${relation.from} -> ${relation.to}`);
      directSubset.add(relationKey(relation.from, relation.to));
    } else if (relation.kind === 'disjointWith') {
      invariant(sets.has(relation.from) && sets.has(relation.to), `disjoint relation must reference sets: ${relation.from} / ${relation.to}`);
      directDisjoint.add(pairKey(relation.from, relation.to));
    } else if (relation.kind === 'overlapsWith') {
      invariant(sets.has(relation.from) && sets.has(relation.to), `overlap relation must reference sets: ${relation.from} / ${relation.to}`);
      directOverlap.add(pairKey(relation.from, relation.to));
    }
  }

  const ids = [...sets.keys()].sort();
  const subset = transitiveClosure(ids, directSubset);

  // Membership propagates upward through the proven subset closure. The source
  // list remains explicit while the effective list records logical entailment.
  for (const id of ids) {
    const target = sets.get(id);
    for (const sourceId of ids) {
      if (!subset.has(relationKey(sourceId, id))) continue;
      for (const member of sets.get(sourceId).directMembers) target.members.add(member);
    }
  }

  // A ⊆ B and B ⟂ C proves A ⟂ C. The symmetric form is represented by pairKey.
  const disjoint = new Set(directDisjoint);
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of [...disjoint]) {
      const [left, right] = splitKey(key);
      for (const candidate of ids) {
        if (subset.has(relationKey(candidate, left))) {
          const next = pairKey(candidate, right);
          if (!disjoint.has(next)) { disjoint.add(next); changed = true; }
        }
        if (subset.has(relationKey(candidate, right))) {
          const next = pairKey(candidate, left);
          if (!disjoint.has(next)) { disjoint.add(next); changed = true; }
        }
      }
    }
  }

  for (const key of disjoint) {
    const [leftId, rightId] = splitKey(key);
    const left = sets.get(leftId);
    const right = sets.get(rightId);
    invariant(left && right, `disjoint relation must reference sets: ${leftId} / ${rightId}`);
    invariant(
      !subset.has(relationKey(leftId, rightId)) && !subset.has(relationKey(rightId, leftId)),
      `sets cannot be both subset-related and disjoint: ${leftId} / ${rightId}`,
    );
    const shared = intersection(left.members, right.members);
    invariant(shared.length === 0, `disjoint ${leftId} / ${rightId} has shared members: ${shared.join(', ')}`);
  }

  for (const key of directOverlap) {
    const [leftId, rightId] = splitKey(key);
    const left = sets.get(leftId);
    const right = sets.get(rightId);
    invariant(left && right, `overlap relation must reference sets: ${leftId} / ${rightId}`);
    invariant(!disjoint.has(key), `sets cannot be both overlapping and disjoint: ${leftId} / ${rightId}`);
    invariant(
      !subset.has(relationKey(leftId, rightId)) && !subset.has(relationKey(rightId, leftId)),
      `sets cannot be both subset-related and partially overlapping: ${leftId} / ${rightId}`,
    );
    if (left.complete && right.complete) {
      const shared = intersection(left.members, right.members);
      invariant(shared.length > 0, `complete overlapping sets require a shared member: ${leftId} / ${rightId}`);
      invariant(!isSubset(left.members, right.members) && !isSubset(right.members, left.members), `complete overlapping sets must be partial: ${leftId} / ${rightId}`);
    }
  }

  const setValues = ids.map((id) => sets.get(id));
  const classify = (left, right) => {
    const leftSubset = subset.has(relationKey(left.id, right.id));
    const rightSubset = subset.has(relationKey(right.id, left.id));
    if (leftSubset && rightSubset) return 'equal';
    if (leftSubset) return 'subset';
    if (rightSubset) return 'superset';
    if (disjoint.has(pairKey(left.id, right.id))) return 'disjoint';
    if (directOverlap.has(pairKey(left.id, right.id))) return 'partial-overlap';

    if (left.complete && right.complete) {
      const leftContained = isSubset(left.members, right.members);
      const rightContained = isSubset(right.members, left.members);
      if (leftContained && rightContained) return 'equal';
      if (leftContained) return 'subset';
      if (rightContained) return 'superset';
      if (intersection(left.members, right.members).length === 0) return 'disjoint';
      return 'partial-overlap';
    }

    // Known shared members prove overlap exists, but incomplete membership does
    // not prove that neither side is a subset. Keep the exact topology unknown.
    return 'unknown';
  };

  const pairs = [];
  for (let leftIndex = 0; leftIndex < setValues.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < setValues.length; rightIndex += 1) {
      const left = setValues[leftIndex];
      const right = setValues[rightIndex];
      const shared = intersection(left.members, right.members);
      pairs.push(Object.freeze({
        left: left.id,
        right: right.id,
        topology: classify(left, right),
        overlapKnown: directOverlap.has(pairKey(left.id, right.id)) || shared.length > 0,
        intersection: Object.freeze(shared),
      }));
    }
  }

  return Object.freeze({
    sets: Object.freeze(setValues.map((value) => Object.freeze({
      id: value.id,
      complete: value.complete,
      directMembers: Object.freeze([...value.directMembers].sort()),
      members: Object.freeze([...value.members].sort()),
    }))),
    pairs: Object.freeze(pairs),
    subset: Object.freeze([...subset].filter((key) => {
      const [left, right] = splitKey(key);
      return left !== right;
    }).sort()),
    disjoint: Object.freeze([...disjoint].sort()),
    overlap: Object.freeze([...directOverlap].sort()),
  });
}
