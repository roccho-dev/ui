function fontSizeForRepresentation(representation, theme) {
  if (representation.isGuide) return theme.edge.fontSize;
  if (representation.shape === 'map-attribution') return theme.geo.attributionFontSize;
  if (representation.shape === 'boundary' || representation.shape === 'seq-lane') {
    return theme.vertex.fontSize;
  }
  return representation.depth >= theme.vertex.deepFontFromDepth
    ? theme.vertex.deepFontSize
    : theme.vertex.fontSize;
}

function estimatedLineWidth(label, fontSize) {
  let units = 0;
  for (const character of String(label ?? '')) {
    if (/\s/u.test(character)) units += 0.34;
    else if (character.codePointAt(0) > 0xff) units += 1;
    else units += 0.59;
  }
  return units * fontSize;
}

function estimatedLabelWidth(label, fontSize) {
  return Math.max(0, ...String(label ?? '').split(/\r?\n/u).map(line => estimatedLineWidth(line, fontSize)));
}

function compactLabel(label) {
  const [head] = String(label ?? '').split(/\s+[·|]\s+/u, 1);
  return head?.trim() || '';
}

export function displayedRegionLabel(representation, scale, theme, selected) {
  const label = String(representation.label ?? '');
  if (!label) return '';
  if (selected || representation.isGuide || representation.shape === 'map-attribution') return label;

  const fontSize = fontSizeForRepresentation(representation, theme);
  const width = representation.bounds.width * scale;
  const height = representation.bounds.height * scale;
  const horizontalPadding = representation.shape === 'boundary' || representation.shape === 'seq-lane'
    ? theme.vertex.boundarySpacingLeft * 2
    : fontSize;
  const availableWidth = Math.max(0, width - horizontalPadding);
  const lines = label.split(/\r?\n/u);
  const lineCount = lines.length;
  const minimumHeight = fontSize * (representation.shape === 'boundary' ? 1.7 : Math.max(1.45, lineCount * 1.25));

  if (lineCount > 1 && height < minimumHeight) {
    return height >= fontSize * 1.45 ? lines[0] : '';
  }
  if (height < minimumHeight) return '';

  const estimatedWidth = estimatedLabelWidth(label, fontSize);
  if (estimatedWidth <= availableWidth) return label;
  if (lineCount > 1) return label;

  const wrappedLines = availableWidth > 0 ? Math.ceil(estimatedWidth / availableWidth) : Number.POSITIVE_INFINITY;
  const wrappedMinimumHeight = fontSize * Math.max(1.45, wrappedLines * 1.25);
  if (height >= wrappedMinimumHeight) return label;

  const compact = compactLabel(label);
  return compact !== label && estimatedLabelWidth(compact, fontSize) <= availableWidth
    ? compact
    : '';
}

export function displayedRelationLabel(relation, scale, theme, representationsById, selected) {
  const label = String(relation.label ?? '');
  if (!label) return '';
  if (selected) return label;
  const source = representationsById.get(relation.from);
  const target = representationsById.get(relation.to);
  if (!source || !target) return '';
  const sourceX = source.bounds.x + source.bounds.width / 2;
  const sourceY = source.bounds.y + source.bounds.height / 2;
  const targetX = target.bounds.x + target.bounds.width / 2;
  const targetY = target.bounds.y + target.bounds.height / 2;
  const length = Math.hypot(targetX - sourceX, targetY - sourceY) * scale;
  return estimatedLabelWidth(label, theme.edge.fontSize) + theme.edge.fontSize * 2 <= length
    ? label
    : '';
}
