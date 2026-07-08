import fs from 'node:fs';
import path from 'node:path';

const artifactRoot = path.resolve(process.argv[2] || process.env.REPO_MAP_SVGPANZOOM_ARTIFACT_OUT || 'adapter-result/repo-map-svgpanzoom-artifact');
const htmlPath = path.join(artifactRoot, 'preview/index.html');
if (!fs.existsSync(htmlPath)) throw new Error(`repo map preview missing: ${htmlPath}`);
let html = fs.readFileSync(htmlPath, 'utf8');

const before = html;
html = html.replace(
  "    const box = viewBoxFor(view, graph.policy.world);\n    svg.setAttribute('viewBox', box.x + ' ' + box.y + ' ' + box.w + ' ' + box.h);\n",
  "    const box = viewBoxFor(view, graph.policy.world);\n    svg.setAttribute('viewBox', box.x + ' ' + box.y + ' ' + box.w + ' ' + box.h);\n    viewport.removeAttribute('transform');\n"
);
html = html.replace("    resetCameraToView();\n", "");
html = html.replace("/^pkg:r(\\\\d+)-p(\\\\d+)/", "/^pkg:r(\\d+)-p(\\d+)/");
html = html.replace("/^model:r\\\\d+-p\\\\d+-m/", "/^model:r\\d+-p\\d+-m/");
html = html.replace("return n.id.replace(/^pkg:r(\\d+)-p(\\d+)/, 'p$1-$2');", "return n.id.replace(/^pkg:r(\\d+)-p(\\d+)/, 'p$2');");

if (html === before) throw new Error('repo map preview patch found no expected camera/viewBox block');
fs.writeFileSync(htmlPath, html, 'utf8');
console.log(JSON.stringify({ status: 'repo-map-svgpanzoom-preview-patched', html: path.relative(process.cwd(), htmlPath).split(path.sep).join('/') }, null, 2));
