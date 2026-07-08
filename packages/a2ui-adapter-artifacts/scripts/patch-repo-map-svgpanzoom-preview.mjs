import fs from 'node:fs';
import path from 'node:path';

const artifactRoot = path.resolve(process.argv[2] || process.env.REPO_MAP_SVGPANZOOM_ARTIFACT_OUT || 'adapter-result/repo-map-svgpanzoom-artifact');
const htmlPath = path.join(artifactRoot, 'preview/index.html');
if (!fs.existsSync(htmlPath)) throw new Error(`repo map preview missing: ${htmlPath}`);
let html = fs.readFileSync(htmlPath, 'utf8');

const before = html;
html = html.replace(
  "  const edgeLayer = svgEl('g');\n  const nodeLayer = svgEl('g');\n  viewport.append(edgeLayer, nodeLayer); svg.append(viewport); stage.replaceChildren(svg);\n",
  "  const semanticLayer = svgEl('g');\n  const edgeLayer = svgEl('g');\n  const nodeLayer = svgEl('g');\n  semanticLayer.append(edgeLayer, nodeLayer); viewport.append(semanticLayer); svg.append(viewport); stage.replaceChildren(svg);\n"
);
html = html.replace(
  "    const box = viewBoxFor(view, graph.policy.world);\n    svg.setAttribute('viewBox', box.x + ' ' + box.y + ' ' + box.w + ' ' + box.h);\n",
  "    const box = viewBoxFor(view, graph.policy.world);\n    const focusScale = focusScaleFor(box, graph.policy.world);\n    semanticLayer.setAttribute('transform', focusTransform(box, graph.policy.world));\n"
);
html = html.replace("    resetCameraToView();\n", "");
html = html.replace("labelFontWorld(node, view.policy, view.camera.z, 1)", "labelFontWorld(node, view.policy, view.camera.z, focusScale)");
html = html.replace("/^pkg:r(\\\\d+)-p(\\\\d+)/", "/^pkg:r(\\d+)-p(\\d+)/");
html = html.replace("/^model:r\\\\d+-p\\\\d+-m/", "/^model:r\\d+-p\\d+-m/");
html = html.replace("return n.id.replace(/^pkg:r(\\d+)-p(\\d+)/, 'p$1-$2');", "return n.id.replace(/^pkg:r(\\d+)-p(\\d+)/, 'p$2');");
html = html.replace(
  "edgeLayer.append(svgEl('line', { class: 'edge', 'data-kind': 'edge', x1: s.x, y1: s.y, x2: e.x, y2: e.y, stroke: '#111', 'stroke-width': edge.style?.strokeWidth || 1, 'stroke-dasharray': edge.style?.dash || null }));",
  "edgeLayer.append(svgEl('line', { class: 'edge', 'data-kind': 'edge', 'data-id': edge.id, 'data-target-kind': 'relation', 'data-target-ref': JSON.stringify(repoMapTargetRef(edge, 'repoMap.edge')), x1: s.x, y1: s.y, x2: e.x, y2: e.y, stroke: '#111', 'stroke-width': edge.style?.strokeWidth || 1, 'stroke-dasharray': edge.style?.dash || null }));"
);
html = html.replace(
  "const r = node.rect; const rect = svgEl('rect', { class: 'node node-' + node.role, 'data-kind': 'node', 'data-id': node.id, 'data-role': node.role, 'data-container': node.container || '', x: r.x, y: r.y, width: r.w, height: r.h, fill: node.style?.fill || 'none', stroke: '#111', 'stroke-width': node.style?.strokeWidth || 1 });",
  "const r = node.rect; const rect = svgEl('rect', { class: 'node node-' + node.role, 'data-kind': 'node', 'data-id': node.id, 'data-role': node.role, 'data-container': node.container || '', 'data-target-kind': 'projectionNode', 'data-target-ref': JSON.stringify(repoMapTargetRef(node, 'repoMap.node')), x: r.x, y: r.y, width: r.w, height: r.h, fill: node.style?.fill || 'none', stroke: '#111', 'stroke-width': node.style?.strokeWidth || 1 });"
);
html = html.replace(
  "function labelText(n) {",
  "function focusScaleFor(box, world) { return Math.min(world.w / box.w, world.h / box.h); }\nfunction focusTransform(box, world) { const s = focusScaleFor(box, world); const tx = world.x + (world.w - box.w * s) / 2 - box.x * s; const ty = world.y + (world.h - box.h * s) / 2 - box.y * s; return 'translate(' + tx + ' ' + ty + ') scale(' + s + ')'; }\nfunction repoMapTargetRef(record, sourceType) { const role = record.role || record.relation || 'component'; const targetKind = sourceType === 'repoMap.edge' ? 'relation' : sourceType === 'repoMap.node' ? 'projectionNode' : 'component'; return { kind: 'ui.targetRef.v1', targetKind, targetId: record.id, sourceType, sourceKind: record.kind || sourceType, sourceId: record.id, role, authority: false, proposalOnly: true }; }\nfunction labelText(n) {"
);

if (html === before) throw new Error('repo map preview patch found no expected camera/viewBox block');
if (!html.includes('ui.targetRef.v1') || !html.includes('data-target-ref')) throw new Error('repo map preview patch did not inject targetRef metadata');
fs.writeFileSync(htmlPath, html, 'utf8');
console.log(JSON.stringify({ status: 'repo-map-svgpanzoom-preview-patched', html: path.relative(process.cwd(), htmlPath).split(path.sep).join('/'), targetRef: true }, null, 2));
