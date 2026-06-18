import atlasData from '../data/atlas-data.json' with {type: 'json'};

export const WORLD = Object.freeze({w: 1180, h: 1020});
export const ROLES = Object.freeze(['CEO', 'CTO', 'CFO', 'CPO', 'COO', 'REVIEW', 'OPS']);
export const LAYER_ORDER = Object.freeze({
  ceo: 0,
  cpo: 1,
  cto: 2,
  coo: 3,
  cfo: 4,
  review_agent: 5,
  ops_agent: 6,
  ops: 6,
});
export const LAYER_COLORS = Object.freeze({
  ceo: '#7fb0ff',
  cpo: '#eaa6ff',
  cto: '#9d8cff',
  coo: '#7de6ff',
  cfo: '#ffd166',
  review_agent: '#ff8fb0',
  ops_agent: '#8df0bd',
  ops: '#8df0bd',
});
export const LAYER_ACTOR = Object.freeze({
  ceo: 'CEO',
  cpo: 'CPO',
  cto: 'CTO',
  coo: 'COO',
  cfo: 'CFO',
  review_agent: 'REVIEW',
  ops_agent: 'OPS',
  ops: 'OPS',
});
export const ACTOR_LAYER = Object.freeze({
  CEO: 'ceo',
  CPO: 'cpo',
  CTO: 'cto',
  COO: 'coo',
  CFO: 'cfo',
  REVIEW: 'review_agent',
  OPS: 'ops_agent',
});
export const SUPPORT_KINDS = Object.freeze(new Set([
  'contributes_to',
  'evidence_for',
  'enables',
  'operationalizes',
  'defines',
  'informs',
]));
export const PURPOSE_LABELS = Object.freeze({
  ceo_company_sale: '法人売却',
  ceo_orbit_mission: '衛星軌道投入',
  ceo_happy_retirement: '幸せな老後',
});

export const BASE_NODES = Object.freeze(atlasData.base_nodes);
export const BASE_EDGES = Object.freeze(atlasData.base_edges);
export const EVENTS = Object.freeze(atlasData.events);

export function actorOf(node) {
  return node?.actorCategory || LAYER_ACTOR[node?.layer] || 'CEO';
}

export function roleFromMember(value) {
  const member = String(value || '').toLowerCase();
  if (member.startsWith('cto')) return 'CTO';
  if (member.startsWith('cfo')) return 'CFO';
  if (member.startsWith('cpo')) return 'CPO';
  if (member.startsWith('coo')) return 'COO';
  if (member.startsWith('ops')) return 'OPS';
  if (member.startsWith('review')) return 'REVIEW';
  return 'CEO';
}

export function labelFromId(id) {
  return PURPOSE_LABELS[id] || String(id || '')
    .replace(/^(ceo|cfo|cto|cpo|coo|ops)_/, '')
    .replaceAll('_', ' ');
}

export function hash01(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 100000) / 100000;
}

export function radius(node) {
  return Math.max(28, 42 * Number(node?.size || 1));
}

function jitter(id, span) {
  return (hash01(id) - 0.5) * span;
}

function blankModel() {
  const cxo = Object.fromEntries(ROLES.map((role) => [role, {count: 0, latest: '未受信'}]));
  return {
    t: 0,
    nodes: {},
    edges: {},
    contracts: {},
    currentPurpose: null,
    lastEvent: null,
    activities: [],
    cxo,
    eventLog: [],
  };
}

function upsertNode(model, node, base = false) {
  const previous = model.nodes[node.id] || {};
  const next = {...previous, ...structuredClone(node)};
  next.status = node.status || previous.status || 'active';
  next.createdAt = next.createdAt || model.t;
  next.base = base || Boolean(previous.base);
  next.actorCategory = node.actorCategory || previous.actorCategory || LAYER_ACTOR[next.layer] || 'CEO';
  next.r = radius(next);
  model.nodes[next.id] = next;
  return next;
}

function upsertEdge(model, edge, base = false) {
  const id = edge.id || `${edge.source}__${edge.target}__${edge.kind}`;
  model.edges[id] = {
    id,
    source: edge.source,
    target: edge.target,
    kind: edge.kind || 'link',
    weight: edge.weight || 0.7,
    directed: edge.directed !== false,
    label: edge.label || '',
    base,
    createdAt: model.t,
    status: 'active',
  };
}

function ensureContractNode(model, id, event) {
  if (!model.nodes[id]) {
    const layer = String(id).split('_')[0] || 'ceo';
    upsertNode(model, {
      id,
      label: labelFromId(id),
      layer,
      kind: 'purpose',
      size: 1,
      status: 'planned',
    });
  }
  if (event?.role) model.nodes[id].role = event.role;
}

function applyEvent(model, event) {
  model.t = event.t;
  model.lastEvent = structuredClone(event);
  model.eventLog.unshift(
    `t${event.t} ${event.type} ${event.label || event.labelText || event.id || event.node || event.terminal || ''}`,
  );
  model.eventLog = model.eventLog.slice(0, 8);

  switch (event.type) {
    case 'contract.upsert': {
      ensureContractNode(model, event.node, event);
      model.contracts[event.node] = {
        node: event.node,
        role: event.role,
        context: event.context,
        requires: event.requires || [],
        rejects: event.rejects || [],
        label: event.label || '',
      };
      model.nodes[event.node].contract = true;
      if (model.nodes[event.node].status !== 'archived') model.nodes[event.node].status = 'active';
      break;
    }
    case 'purpose.set': {
      model.currentPurpose = event.terminal;
      ensureContractNode(model, event.terminal, event);
      model.nodes[event.terminal].status = 'active';
      model.nodes[event.terminal].terminal = true;
      break;
    }
    case 'node.upsert':
      upsertNode(model, event);
      break;
    case 'edge.upsert':
      upsertEdge(model, event);
      break;
    case 'node.obsolete': {
      const id = event.node || event.id;
      if (model.nodes[id]) {
        model.nodes[id].status = 'archived';
        model.nodes[id].archivedAt = event.t;
      }
      break;
    }
    case 'cxo.activity': {
      const role = roleFromMember(event.member || event.node);
      const target = model.nodes[event.node];
      model.cxo[role] ||= {count: 0, latest: '未受信'};
      model.cxo[role].count += 1;
      model.cxo[role].latest = event.activity || event.label || '';
      const activity = {
        role,
        node: event.node,
        activity: event.activity || event.label || '',
        t: event.t,
      };
      model.activities.unshift(activity);
      if (target) target.lastActivity = {role, text: activity.activity, t: event.t};
      break;
    }
    default:
      break;
  }
}

function supportDistances(model) {
  const distances = {};
  if (!model.currentPurpose || !model.nodes[model.currentPurpose]) return distances;
  const incoming = {};
  for (const edge of Object.values(model.edges)) {
    if (!SUPPORT_KINDS.has(edge.kind) || !model.nodes[edge.source] || !model.nodes[edge.target]) continue;
    (incoming[edge.target] ||= []).push(edge.source);
  }
  const queue = [model.currentPurpose];
  distances[model.currentPurpose] = 0;
  while (queue.length) {
    const target = queue.shift();
    for (const source of incoming[target] || []) {
      if (distances[source] != null) continue;
      distances[source] = distances[target] + 1;
      queue.push(source);
    }
  }
  return distances;
}

function fallbackMetaRank(node, model) {
  if (node.id === model.currentPurpose) return 0;
  if (node.role === 'terminal_purpose') return 1;
  if (node.kind === 'purpose' || node.kind === 'milestone') return 2;
  if (['vehicle', 'capability', 'investigation'].includes(node.kind)) return 3;
  if (['evidence', 'metric', 'review'].includes(node.kind)) return 4;
  return 5;
}

function relaxLayout(model) {
  const nodes = Object.values(model.nodes);
  const axisX = 0.915;
  const axisY = 0.401;
  const normX = -axisY;
  const normY = axisX;

  for (let iteration = 0; iteration < 96; iteration += 1) {
    const fx = nodes.map(() => 0);
    const fy = nodes.map(() => 0);
    for (let index = 0; index < nodes.length; index += 1) {
      const first = nodes[index];
      for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex += 1) {
        const second = nodes[otherIndex];
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const distance = Math.hypot(dx, dy);
        const needed = first.r + second.r + 14;
        if (distance >= needed) continue;
        let ux;
        let uy;
        if (distance < 0.01) {
          const angle = hash01(`${first.id}|${second.id}`) * Math.PI * 2;
          ux = Math.cos(angle);
          uy = Math.sin(angle);
        } else {
          ux = dx / distance;
          uy = dy / distance;
        }
        const overlap = (needed - distance) / 2;
        let sx = ux;
        let sy = uy;
        if (Math.abs(first.metaRank - second.metaRank) <= 1) {
          const sign = ux * normX + uy * normY >= 0 ? 1 : -1;
          sx = normX * sign * 0.86 + ux * 0.14;
          sy = normY * sign * 0.86 + uy * 0.14;
          const size = Math.hypot(sx, sy) || 1;
          sx /= size;
          sy /= size;
        }
        fx[index] -= sx * overlap;
        fy[index] -= sy * overlap;
        fx[otherIndex] += sx * overlap;
        fy[otherIndex] += sy * overlap;
      }
    }

    let movement = 0;
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const anchorDx = node.ax - node.x;
      const anchorDy = node.ay - node.y;
      const axisDelta = anchorDx * axisX + anchorDy * axisY;
      const normalDelta = anchorDx * normX + anchorDy * normY;
      let vx = fx[index] * 0.42 + axisX * axisDelta * 0.12 + normX * normalDelta * 0.035;
      let vy = fy[index] * 0.42 + axisY * axisDelta * 0.12 + normY * normalDelta * 0.035;
      const magnitude = Math.hypot(vx, vy);
      if (magnitude > 14) {
        vx *= 14 / magnitude;
        vy *= 14 / magnitude;
      }
      node.x += vx;
      node.y += vy;
      movement += Math.abs(vx) + Math.abs(vy);
      const margin = node.r + 18;
      node.x = Math.max(margin, Math.min(WORLD.w - margin, node.x));
      node.y = Math.max(margin, Math.min(WORLD.h - margin, node.y));
    }
    if (movement < 0.05) break;
  }
}

function applyMetaLayout(model) {
  const distances = supportDistances(model);
  for (const [id, node] of Object.entries(model.nodes)) {
    const layerIndex = LAYER_ORDER[node.layer] ?? 3;
    const rank = Math.max(0, Math.min(8, distances[id] ?? fallbackMetaRank(node, model)));
    node.metaRank = rank;
    node.metaBasis = distances[id] != null ? 'support_path_to_current_purpose' : 'fallback_kind';
    node.ax = 132 + rank * 146 + layerIndex * 10 + jitter(`x:${id}`, 44);
    node.ay = 185 + rank * 64 + layerIndex * 24 + jitter(`y:${id}`, 34);
    if (node.status === 'archived') {
      node.ax += 28;
      node.ay += 18;
    }
    node.x = node.ax;
    node.y = node.ay;
    node.r = radius(node);
  }
  relaxLayout(model);
}

export function makeModel(step = 0) {
  const boundedStep = Math.max(0, Math.min(EVENTS.length, Number(step) || 0));
  const model = blankModel();
  BASE_NODES.forEach((node) => upsertNode(model, node, true));
  BASE_EDGES.forEach((edge) => upsertEdge(model, edge, true));
  for (let index = 0; index < boundedStep; index += 1) applyEvent(model, EVENTS[index]);
  applyMetaLayout(model);
  return model;
}

export function activeNodes(model, zoom = 1) {
  return Object.values(model.nodes).filter(
    (node) => !(node.status === 'archived' && zoom < 0.72 && node.id !== model.currentPurpose),
  );
}

export function activeEdges(model) {
  return Object.values(model.edges).filter((edge) => model.nodes[edge.source] && model.nodes[edge.target]);
}

export function pathExists(model, source, target) {
  if (!model.nodes[source] || !model.nodes[target]) return false;
  if (source === target) return true;
  const queue = [source];
  const seen = new Set(queue);
  const edges = activeEdges(model);
  while (queue.length) {
    const current = queue.shift();
    for (const edge of edges) {
      if (edge.source !== current || !SUPPORT_KINDS.has(edge.kind) || seen.has(edge.target)) continue;
      if (edge.target === target) return true;
      seen.add(edge.target);
      queue.push(edge.target);
    }
  }
  return false;
}

export function evaluateGuard(model) {
  if (!model.currentPurpose) {
    return {status: 'warn', text: 'terminal purposeが未設定', owner: 'CEO', missing: [], action: 'contract を定義'};
  }
  const contract = model.contracts[model.currentPurpose];
  if (!contract) {
    return {
      status: 'warn',
      text: `${labelFromId(model.currentPurpose)} contract未登録`,
      owner: 'CEO',
      missing: [],
      action: '定義と登録が必要',
    };
  }
  const missing = contract.requires.filter((id) => {
    const node = model.nodes[id];
    return !node || node.status === 'archived' || !pathExists(model, id, model.currentPurpose);
  });
  if (missing.length) {
    const first = labelFromId(missing[0]);
    return {
      status: 'missing',
      text: `${first}が条件未達成`,
      owner: roleFromMember(missing[0]),
      missing,
      action: `${first}の接続経路確立が必要`,
    };
  }
  return {status: 'ok', text: '全要件が接続・充足', owner: 'CEO', missing: [], action: '定期確認継続'};
}

function cloneActorSets(input) {
  return Object.fromEntries(
    Object.entries(input).map(([actor, ids]) => [actor, new Set(ids)]),
  );
}

export function responsibilityData(model, rootId) {
  const incoming = {};
  const edges = activeEdges(model);
  for (const edge of edges) {
    if (!SUPPORT_KINDS.has(edge.kind)) continue;
    (incoming[edge.target] ||= []).push(edge);
  }
  const memo = new Map();

  function recurse(id, stack = new Set()) {
    if (memo.has(id)) return cloneActorSets(memo.get(id));
    if (stack.has(id)) return {};
    const nextStack = new Set(stack).add(id);
    const incomingEdges = incoming[id] || [];
    const result = {};
    if (!incomingEdges.length) {
      const actor = actorOf(model.nodes[id]);
      result[actor] = new Set([id]);
      memo.set(id, result);
      return cloneActorSets(result);
    }
    for (const edge of incomingEdges) {
      const child = edge.source;
      const actor = actorOf(model.nodes[child]);
      (result[actor] ||= new Set()).add(child);
      const nested = recurse(child, nextStack);
      for (const [nestedActor, ids] of Object.entries(nested)) {
        result[nestedActor] ||= new Set();
        ids.forEach((nodeId) => result[nestedActor].add(nodeId));
      }
    }
    memo.set(id, result);
    return cloneActorSets(result);
  }

  const sets = recurse(rootId);
  const composition = {};
  const branches = {};
  for (const [actor, nodeIds] of Object.entries(sets)) {
    composition[actor] = nodeIds.size;
    const edgeIds = edges
      .filter((edge) => SUPPORT_KINDS.has(edge.kind))
      .filter((edge) => nodeIds.has(edge.source) && (nodeIds.has(edge.target) || edge.target === rootId))
      .map((edge) => edge.id);
    branches[actor] = {nodeIds: [...nodeIds], edgeIds};
  }
  return {composition, branches};
}

export function compositionEntries(model, nodeId) {
  const composition = responsibilityData(model, nodeId).composition;
  const sum = Object.values(composition).reduce((total, value) => total + value, 0);
  return Object.entries(composition)
    .map(([actor, value]) => ({actor, value, ratio: sum ? value / sum : 0}))
    .sort((first, second) => second.value - first.value || ROLES.indexOf(first.actor) - ROLES.indexOf(second.actor));
}

function serializeNode(node, model, guard) {
  return {
    ...structuredClone(node),
    actor: actorOf(node),
    current: node.id === model.currentPurpose,
    missing: guard.missing.includes(node.id),
  };
}

export function buildSnapshot(step, {zoom = 1} = {}) {
  const model = makeModel(step);
  const guard = evaluateGuard(model);
  const nodes = activeNodes(model, zoom).map((node) => serializeNode(node, model, guard));
  const edges = activeEdges(model).map((edge) => ({...structuredClone(edge), support: SUPPORT_KINDS.has(edge.kind)}));
  const responsibility = {};
  for (const node of nodes) {
    if (
      node.current ||
      node.contract ||
      node.kind === 'purpose' ||
      node.kind === 'milestone'
    ) {
      const data = responsibilityData(model, node.id);
      responsibility[node.id] = {
        composition: compositionEntries(model, node.id),
        branches: data.branches,
      };
    }
  }
  const currentComposition = model.currentPurpose ? compositionEntries(model, model.currentPurpose) : [];
  return {
    version: 'v6-a2ui-web-core',
    protocolVersion: 'v0.9',
    world: WORLD,
    t: model.t,
    maxStep: EVENTS.length,
    currentPurposeId: model.currentPurpose,
    currentPurpose: model.currentPurpose ? labelFromId(model.currentPurpose) : '未設定',
    lastEvent: model.lastEvent ? structuredClone(model.lastEvent) : null,
    lastEventLabel: model.lastEvent?.label || model.lastEvent?.labelText || model.lastEvent?.type || '初期投影',
    guard,
    nodes,
    edges,
    responsibility,
    currentComposition,
    eventLog: [...model.eventLog],
    cxo: structuredClone(model.cxo),
    counts: {
      nodes: nodes.length,
      edges: edges.length,
      responsibilityActors: currentComposition.length,
      roleNodes: nodes.filter((node) => node.kind === 'role').length,
    },
  };
}

export function describeSelection(snapshot, selection) {
  if (!selection?.nodeId) {
    return {
      type: 'none',
      title: '選択なし',
      copy: 'nodeまたは責務リングを選択すると、目的との関係・責務構成・操作候補を確認できます。',
      chips: [],
      coverage: [],
    };
  }
  const node = snapshot.nodes.find((item) => item.id === selection.nodeId);
  if (!node) return describeSelection(snapshot, null);
  const responsibility = snapshot.responsibility[node.id] || {composition: [], branches: {}};
  if (selection.type === 'responsibility' && selection.actor) {
    const branch = responsibility.branches[selection.actor] || {nodeIds: [], edgeIds: []};
    const coverage = branch.nodeIds
      .map((id) => snapshot.nodes.find((candidate) => candidate.id === id)?.label || labelFromId(id))
      .slice(0, 10);
    return {
      type: 'responsibility',
      title: `${selection.actor}責務 · ${node.label}`,
      copy: '目的を支えるsubgraphから再帰集約した責務です。別nodeではなく、既存nodeの責務カテゴリを外周へ投影しています。',
      chips: [
        {label: `coverage ${branch.nodeIds.length} nodes`, tone: 'info'},
        {label: `${branch.edgeIds.length} support edges`, tone: 'info'},
      ],
      coverage,
      nodeId: node.id,
      actor: selection.actor,
    };
  }
  return {
    type: 'node',
    title: node.label,
    copy: `${node.labelText || node.purposeLabel || node.kind || ''}${node.status === 'archived' ? ' / archiveとして残っています' : ''}`,
    chips: [
      {label: `${node.actor}責務`, tone: 'actor', actor: node.actor},
      {label: node.kind || 'node', tone: 'info'},
      {label: `meta ${Number(node.metaRank).toFixed(1)}`, tone: 'info'},
      ...responsibility.composition.slice(0, 6).map((entry) => ({
        label: `${entry.actor} ${Math.round(entry.ratio * 100)}%`,
        tone: 'actor',
        actor: entry.actor,
      })),
    ],
    coverage: [],
    nodeId: node.id,
    actor: node.actor,
  };
}

export function modelForTesting(step) {
  return makeModel(step);
}
