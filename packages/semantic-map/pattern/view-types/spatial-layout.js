import { SEMANTIC_2D_SPACE, TOPOLOGY_SPACE } from '../../domain/index.js';

const GRAPH_LEAF_WIDTH = 180;
const GRAPH_LEAF_HEIGHT = 92;
const GRAPH_PADDING_X = 32;
const GRAPH_PADDING_Y = 26;
const GRAPH_HEADER = 46;
const GRAPH_COLUMN_GAP = 76;
const GRAPH_ROW_GAP = 30;

function frozenBounds(x, y, width, height) {
  return Object.freeze({ x, y, width, height });
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function orderedRegions(domain, ids) {
  return [...ids].sort((leftId, rightId) => {
    const left = domain.regions.get(leftId);
    const right = domain.regions.get(rightId);
    const leftOrder = Number.isSafeInteger(left.order) ? left.order : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isSafeInteger(right.order) ? right.order : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || compareText(leftId, rightId);
  });
}

export function createMapLayout(domain) {
  const bounds = new Map();
  for (const region of domain.regions.values()) bounds.set(region.id, region.bounds);
  return Object.freeze({
    pattern: 'map/1',
    space: SEMANTIC_2D_SPACE,
    bounds,
    rootBounds: bounds.get(domain.meta.root),
    forceExpanded: new Set(),
    geometryEditable: true,
  });
}

function directChild(domain, parentId, endpointId) {
  let current = endpointId;
  while (current !== null) {
    const region = domain.regions.get(current);
    if (!region) return null;
    if (region.parent === parentId) return current;
    current = region.parent;
  }
  return null;
}

function stronglyConnectedComponents(nodes, adjacency) {
  let nextIndex = 0;
  const stack = [];
  const onStack = new Set();
  const indexByNode = new Map();
  const lowByNode = new Map();
  const components = [];

  function visit(node) {
    indexByNode.set(node, nextIndex);
    lowByNode.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);

    for (const target of adjacency.get(node) ?? []) {
      if (!indexByNode.has(target)) {
        visit(target);
        lowByNode.set(node, Math.min(lowByNode.get(node), lowByNode.get(target)));
      } else if (onStack.has(target)) {
        lowByNode.set(node, Math.min(lowByNode.get(node), indexByNode.get(target)));
      }
    }

    if (lowByNode.get(node) !== indexByNode.get(node)) return;
    const component = [];
    while (stack.length) {
      const member = stack.pop();
      onStack.delete(member);
      component.push(member);
      if (member === node) break;
    }
    components.push(Object.freeze(component.sort()));
  }

  for (const node of nodes) if (!indexByNode.has(node)) visit(node);
  return components;
}

function graphRanks(domain, parentId, childIds) {
  const ordered = orderedRegions(domain, childIds);
  const childSet = new Set(ordered);
  const adjacency = new Map(ordered.map((id) => [id, new Set()]));

  for (const relation of domain.relations) {
    const from = directChild(domain, parentId, relation.from);
    const to = directChild(domain, parentId, relation.to);
    if (!from || !to || from === to || !childSet.has(from) || !childSet.has(to)) continue;
    adjacency.get(from).add(to);
  }

  const sortedAdjacency = new Map(
    [...adjacency].map(([id, targets]) => [id, Object.freeze([...targets].sort())]),
  );
  const components = stronglyConnectedComponents(ordered, sortedAdjacency);
  const componentByNode = new Map();
  components.forEach((component, index) => component.forEach((node) => componentByNode.set(node, index)));
  const componentKey = (index) => components[index][0];
  const successors = new Map(components.map((_, index) => [index, new Set()]));
  const predecessors = new Map(components.map((_, index) => [index, new Set()]));

  for (const [from, targets] of sortedAdjacency) {
    const fromComponent = componentByNode.get(from);
    for (const to of targets) {
      const toComponent = componentByNode.get(to);
      if (fromComponent === toComponent) continue;
      successors.get(fromComponent).add(toComponent);
      predecessors.get(toComponent).add(fromComponent);
    }
  }

  const indegree = new Map(components.map((_, index) => [index, predecessors.get(index).size]));
  const ready = components.map((_, index) => index)
    .filter((index) => indegree.get(index) === 0)
    .sort((a, b) => compareText(componentKey(a), componentKey(b)));
  const ranks = new Map(components.map((_, index) => [index, 0]));
  const topological = [];

  while (ready.length) {
    const current = ready.shift();
    topological.push(current);
    const targets = [...successors.get(current)].sort((a, b) => compareText(componentKey(a), componentKey(b)));
    for (const target of targets) {
      ranks.set(target, Math.max(ranks.get(target), ranks.get(current) + 1));
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) {
        ready.push(target);
        ready.sort((a, b) => compareText(componentKey(a), componentKey(b)));
      }
    }
  }

  const rankByNode = new Map();
  for (const componentIndex of topological) {
    for (const node of components[componentIndex]) rankByNode.set(node, ranks.get(componentIndex));
  }
  return rankByNode;
}

export function createGraphLayout(domain) {
  const measured = new Map();

  function measure(id) {
    if (measured.has(id)) return measured.get(id);
    const childIds = orderedRegions(
      domain,
      (domain.children.get(id) ?? []).filter((childId) => domain.regions.get(childId).kind !== 'actor'),
    );
    if (childIds.length === 0) {
      const leaf = Object.freeze({ width: GRAPH_LEAF_WIDTH, height: GRAPH_LEAF_HEIGHT, offsets: new Map() });
      measured.set(id, leaf);
      return leaf;
    }

    const children = new Map(childIds.map((childId) => [childId, measure(childId)]));
    const rankByNode = graphRanks(domain, id, childIds);
    const ranks = [...new Set(rankByNode.values())].sort((a, b) => a - b);
    const columns = ranks.map((rank) => {
      const ids = childIds.filter((childId) => rankByNode.get(childId) === rank);
      const width = Math.max(...ids.map((childId) => children.get(childId).width));
      const height = ids.reduce((sum, childId) => sum + children.get(childId).height, 0)
        + GRAPH_ROW_GAP * Math.max(0, ids.length - 1);
      return { rank, ids, width, height };
    });
    const contentWidth = columns.reduce((sum, column) => sum + column.width, 0)
      + GRAPH_COLUMN_GAP * Math.max(0, columns.length - 1);
    const contentHeight = Math.max(...columns.map((column) => column.height));
    const width = Math.max(GRAPH_LEAF_WIDTH, GRAPH_PADDING_X * 2 + contentWidth);
    const height = Math.max(GRAPH_LEAF_HEIGHT, GRAPH_HEADER + GRAPH_PADDING_Y * 2 + contentHeight);
    const offsets = new Map();
    let x = GRAPH_PADDING_X;
    for (const column of columns) {
      let y = GRAPH_HEADER + GRAPH_PADDING_Y + (contentHeight - column.height) / 2;
      for (const childId of column.ids) {
        const child = children.get(childId);
        offsets.set(childId, Object.freeze({ x: x + (column.width - child.width) / 2, y }));
        y += child.height + GRAPH_ROW_GAP;
      }
      x += column.width + GRAPH_COLUMN_GAP;
    }
    const result = Object.freeze({ width, height, offsets });
    measured.set(id, result);
    return result;
  }

  const rootId = domain.meta.root;
  const rootMeasure = measure(rootId);
  const rootWidth = Math.max(640, rootMeasure.width);
  const rootHeight = Math.max(420, rootMeasure.height);
  const bounds = new Map();

  function place(id, x, y, widthOverride = null, heightOverride = null) {
    const size = measured.get(id);
    const width = widthOverride ?? size.width;
    const height = heightOverride ?? size.height;
    bounds.set(id, frozenBounds(x, y, width, height));
    const dx = (width - size.width) / 2;
    const dy = (height - size.height) / 2;
    for (const [childId, offset] of size.offsets) {
      place(childId, x + dx + offset.x, y + dy + offset.y);
    }
  }

  place(rootId, 0, 0, rootWidth, rootHeight);
  return Object.freeze({
    pattern: 'graph/1',
    space: TOPOLOGY_SPACE,
    bounds,
    rootBounds: bounds.get(rootId),
    forceExpanded: new Set(),
    geometryEditable: false,
  });
}
