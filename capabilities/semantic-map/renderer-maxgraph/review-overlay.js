const REVIEW_OVERLAY_SCHEMA = 'semantic-map-review-overlay/1';
const REVIEW_STATUSES = new Set(['added', 'removed', 'changed']);

function reviewSvg(name, attributes = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function reviewScreenBounds(bounds, camera) {
  if (!bounds) return null;
  return {
    x: (bounds.x + camera.translateX) * camera.scale,
    y: (bounds.y + camera.translateY) * camera.scale,
    width: bounds.width * camera.scale,
    height: bounds.height * camera.scale,
  };
}

function reviewSameBounds(left, right) {
  return left && right
    && left.x === right.x
    && left.y === right.y
    && left.width === right.width
    && left.height === right.height;
}

function appendReviewRegion(group, item, bounds, camera, phase) {
  const screen = reviewScreenBounds(bounds, camera);
  if (!screen) return;
  const rect = reviewSvg('rect', {
    x: screen.x,
    y: screen.y,
    width: screen.width,
    height: screen.height,
    rx: Math.min(10, Math.max(2, Math.min(screen.width, screen.height) * 0.08)),
    'data-review-id': item.id,
    'data-review-kind': 'region',
    'data-review-status': item.status,
    'data-review-phase': phase,
    'vector-effect': 'non-scaling-stroke',
  });
  rect.classList.add('semantic-review-region', `semantic-review-${item.status}`, `semantic-review-${phase}`);
  group.append(rect);
}

function appendReviewRelation(group, item, segment, camera, phase) {
  if (!segment) return;
  const line = reviewSvg('line', {
    x1: (segment.from.x + camera.translateX) * camera.scale,
    y1: (segment.from.y + camera.translateY) * camera.scale,
    x2: (segment.to.x + camera.translateX) * camera.scale,
    y2: (segment.to.y + camera.translateY) * camera.scale,
    'data-review-id': item.id,
    'data-review-kind': 'relation',
    'data-review-status': item.status,
    'data-review-phase': phase,
    'vector-effect': 'non-scaling-stroke',
  });
  line.classList.add('semantic-review-relation', `semantic-review-${item.status}`, `semantic-review-${phase}`);
  group.append(line);
}

function appendReviewBadge(group, item, bounds, camera) {
  const screen = reviewScreenBounds(bounds, camera);
  if (!screen) return;
  const marker = item.status === 'added' ? '+' : item.status === 'removed' ? '−' : 'Δ';
  const badge = reviewSvg('g', {
    'data-review-id': item.id,
    'data-review-kind': 'badge',
    'data-review-status': item.status,
  });
  badge.classList.add('semantic-review-badge', `semantic-review-${item.status}`);
  const circle = reviewSvg('circle', {
    cx: screen.x + screen.width,
    cy: screen.y,
    r: 10,
    'vector-effect': 'non-scaling-stroke',
  });
  const label = reviewSvg('text', {
    x: screen.x + screen.width,
    y: screen.y + 4,
    'text-anchor': 'middle',
  });
  label.textContent = marker;
  badge.append(circle, label);
  group.append(badge);
}

export function appendReviewOverlay(root, overlay, camera) {
  if (!overlay) return;
  const group = reviewSvg('g', {
    'data-layer': 'semantic-review',
    'data-proposal-id': overlay.proposalId,
    'data-authority': 'false',
  });
  group.classList.add('semantic-review-overlay');

  for (const item of overlay.relations) {
    if (item.status === 'removed' || item.status === 'changed') {
      appendReviewRelation(group, item, item.before, camera, 'before');
    }
    if (item.status === 'added' || item.status === 'changed') {
      appendReviewRelation(group, item, item.after, camera, 'after');
    }
  }
  for (const item of overlay.regions) {
    const distinct = !reviewSameBounds(item.beforeBounds, item.afterBounds);
    if (item.status === 'removed' || (item.status === 'changed' && distinct)) {
      appendReviewRegion(group, item, item.beforeBounds, camera, 'before');
    }
    if (item.status === 'added' || item.status === 'changed') {
      appendReviewRegion(group, item, item.afterBounds, camera, 'after');
    }
    const badgeBounds = item.status === 'removed' ? item.beforeBounds : item.afterBounds;
    appendReviewBadge(group, item, badgeBounds, camera);
  }
  root.append(group);
}


export function assertReviewOverlay(overlay) {
  if (overlay?.schema !== REVIEW_OVERLAY_SCHEMA) throw new Error('review overlay schema is invalid');
  if (overlay.authority !== false || overlay.status !== 'proposal') {
    throw new Error('review overlay must remain a non-authority Proposal');
  }
  if (!Array.isArray(overlay.regions) || !Array.isArray(overlay.relations)) {
    throw new Error('review overlay regions and relations are required');
  }
  for (const item of [...overlay.regions, ...overlay.relations]) {
    if (!REVIEW_STATUSES.has(item.status)) throw new Error(`review overlay status is invalid: ${item.status}`);
  }
}
