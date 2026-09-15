import { SEMANTIC_2D_SPACE, TOPOLOGY_SPACE } from '../../domain/index.js';
import { isGraphItemKind } from './graph/contract.js';

const GRAPH_LEAF_WIDTH = 180;
const GRAPH_STRUCTURED_LEAF_WIDTH = 320;
const GRAPH_LONG_LABEL_MIN_CHARS = 24;
const GRAPH_LONG_LABEL_HEIGHT = 110;
const GRAPH_LEAF_HEIGHT = 92;
const GRAPH_PADDING_X = 32;
const GRAPH_PADDING_Y = 26;
const GRAPH_HEADER = 46;
const GRAPH_ITEM_ROW_HEIGHT = 22;
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
  const orderIndex = new Map(ordered.map((id, index) => [id, index]));
  const orderedComponents = components.map((component) => Object.freeze(
    [...component].sort((left, right) => orderIndex.get(left) - orderIndex.get(right)),
  ));
  const componentByNode = new Map();
  orderedComponents.forEach((component, index) => component.forEach((node) => componentByNode.set(node, index)));
  const componentKey = (index) => orderedComponents[index][0];
  const successors = new Map(orderedComponents.map((_, index) => [index, new Set()]));
  const predecessors = new Map(orderedComponents.map((_, index) => [index, new Set()]));

  for (const [from, targets] of sortedAdjacency) {
    const fromComponent = componentByNode.get(from);
    for (const to of targets) {
      const toComponent = componentByNode.get(to);
      if (fromComponent === toComponent) continue;
      successors.get(fromComponent).add(toComponent);
      predecessors.get(toComponent).add(fromComponent);
    }
  }

  const indegree = new Map(orderedComponents.map((_, index) => [index, predecessors.get(index).size]));
  const ready = orderedComponents.map((_, index) => index)
    .filter((index) => indegree.get(index) === 0)
    .sort((a, b) => compareText(componentKey(a), componentKey(b)));
  const ranks = new Map(orderedComponents.map((_, index) => [index, 0]));
  const topological = [];

  while (ready.length) {
    const current = ready.shift();
    topological.push(current);
    const targets = [...successors.get(current)].sort((a, b) => compareText(componentKey(a), componentKey(b)));
    for (const target of targets) {
      ranks.set(target, Math.max(ranks.get(target), ranks.get(current) + orderedComponents[current].length));
      indegree.set(target, indegree.get(target) - 1);
      if (indegree.get(target) === 0) {
        ready.push(target);
        ready.sort((a, b) => compareText(componentKey(a), componentKey(b)));
      }
    }
  }

  const rankByNode = new Map();
  for (const componentIndex of topological) {
    const baseRank = ranks.get(componentIndex);
    orderedComponents[componentIndex].forEach((node, offset) => rankByNode.set(node, baseRank + offset));
  }
  return rankByNode;
}

export function createGraphLayout(domain, { direction = 'LR' } = {}) {
  if (direction !== 'LR' && direction !== 'TB') throw new Error(`graph-layout: unsupported direction ${direction}`);
  const measured = new Map();

  function measure(id) {
    if (measured.has(id)) return measured.get(id);
    const allChildIds = orderedRegions(
      domain,
      (domain.children.get(id) ?? []).filter((childId) => domain.regions.get(childId).kind !== 'actor'),
    );
    const itemCount = allChildIds.filter((childId) => isGraphItemKind(domain.regions.get(childId).kind)).length;
    const childIds = allChildIds.filter((childId) => !isGraphItemKind(domain.regions.get(childId).kind));
    const headerHeight = GRAPH_HEADER + itemCount * GRAPH_ITEM_ROW_HEIGHT;
    const region = domain.regions.get(id);
    const longLabel = region.label.length >= GRAPH_LONG_LABEL_MIN_CHARS;
    if (childIds.length === 0) {
      const leaf = Object.freeze({
        width: itemCount > 0 || longLabel ? GRAPH_STRUCTURED_LEAF_WIDTH : GRAPH_LEAF_WIDTH,
        height: Math.max(GRAPH_LEAF_HEIGHT, headerHeight + GRAPH_PADDING_Y, longLabel ? GRAPH_LONG_LABEL_HEIGHT : 0),
        offsets: new Map(),
      });
      measured.set(id, leaf);
      return leaf;
    }

    const children = new Map(childIds.map((childId) => [childId, measure(childId)]));
    const rankByNode = graphRanks(domain, id, childIds);
    const ranks = [...new Set(rankByNode.values())].sort((a, b) => a - b);
    const bands = ranks.map((rank) => {
      const ids = childIds.filter((childId) => rankByNode.get(childId) === rank);
      if (direction === 'LR') {
        const width = Math.max(...ids.map((childId) => children.get(childId).width));
        const height = ids.reduce((sum, childId) => sum + children.get(childId).height, 0)
          + GRAPH_ROW_GAP * Math.max(0, ids.length - 1);
        return { rank, ids, width, height };
      }
      const width = ids.reduce((sum, childId) => sum + children.get(childId).width, 0)
        + GRAPH_COLUMN_GAP * Math.max(0, ids.length - 1);
      const height = Math.max(...ids.map((childId) => children.get(childId).height));
      return { rank, ids, width, height };
    });

    const offsets = new Map();
    let contentWidth;
    let contentHeight;

    if (direction === 'LR') {
      contentWidth = bands.reduce((sum, band) => sum + band.width, 0)
        + GRAPH_COLUMN_GAP * Math.max(0, bands.length - 1);
      contentHeight = Math.max(...bands.map((band) => band.height));
      let x = GRAPH_PADDING_X;
      for (const band of bands) {
        let y = headerHeight + GRAPH_PADDING_Y + (contentHeight - band.height) / 2;
        for (const childId of band.ids) {
          const child = children.get(childId);
          offsets.set(childId, Object.freeze({ x: x + (band.width - child.width) / 2, y }));
          y += child.height + GRAPH_ROW_GAP;
        }
        x += band.width + GRAPH_COLUMN_GAP;
      }
    } else {
      contentWidth = Math.max(...bands.map((band) => band.width));
      contentHeight = bands.reduce((sum, band) => sum + band.height, 0)
        + GRAPH_ROW_GAP * Math.max(0, bands.length - 1);
      let y = headerHeight + GRAPH_PADDING_Y;
      for (const band of bands) {
        let x = GRAPH_PADDING_X + (contentWidth - band.width) / 2;
        for (const childId of band.ids) {
          const child = children.get(childId);
          offsets.set(childId, Object.freeze({ x, y: y + (band.height - child.height) / 2 }));
          x += child.width + GRAPH_COLUMN_GAP;
        }
        y += band.height + GRAPH_ROW_GAP;
      }
    }

    const width = Math.max(GRAPH_LEAF_WIDTH, GRAPH_PADDING_X * 2 + contentWidth);
    const height = Math.max(GRAPH_LEAF_HEIGHT, headerHeight + GRAPH_PADDING_Y * 2 + contentHeight);
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
    direction,
  });
}