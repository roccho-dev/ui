export const REPO_MAP_KINDS = Object.freeze({
  policy: 'repoMap.policy.v1',
  node: 'repoMap.node.v1',
  edge: 'repoMap.edge.v1',
  world: 'repoMap.world.v1',
  projection: 'repoMap.projection.v1',
});

export const LEGACY_REPO_MAP_KINDS = Object.freeze({
  policy: 'map.policy.v1',
  node: 'map.node.v1',
  edge: 'map.edge.v1',
  world: 'model.graph.v1',
  projection: 'projection.view.v1',
});

export function makeRepoMapFixtureJsonl(options = {}) {
  const kinds = options.kind === 'legacy' ? LEGACY_REPO_MAP_KINDS : REPO_MAP_KINDS
  const records = []
  const policy = { kind: kinds.policy, id: 'policy:map', initialFocus: 'repo:repo-04', initialSelected: '', world: { x: -760, y: -420, w: 7900, h: 2700 }, camera: { z: 0, minZ: 0, maxZ: 100, svgPanZoomMaxZoom: 16 }, font: { basePx: 15, minPx: 4, maxPx: 16, zoomGain: 0.12, depthDecay: 0.7, labelWidthRatio: 0.62 }, label: { xPad: 12, yRatio: 1.2, minScreenW: 42, edgeMinScreenLength: 80 }, edge: { maxVisibleRepo: 9, maxVisiblePackage: 16, maxVisibleModel: 24 } }
  records.push(policy)
  const repos = []
  for (let i = 0; i < 10; i++) {
    const row = Math.floor(i / 5), col = i % 5
    const repo = { kind: kinds.node, id: `repo:repo-${pad(i)}`, label: `repo-${pad(i)}.git`, labelPrefix: 'repo', role: 'repo', depth: 0, lod: { minZ: 0, maxZ: 100 }, rect: { x: col * 1300, y: row * 1140, w: 1040, h: 720 }, style: { strokeWidth: 3, fill: 'none' }, focusable: true }
    repos.push(repo); records.push(repo)
  }
  for (let ri = 0; ri < 10; ri++) for (let pi = 0; pi < 5; pi++) {
    const repo = repos[ri], row = Math.floor(pi / 3), col = pi % 3
    const x = repo.rect.x + 70 + col * 314, y = repo.rect.y + 95 + row * 194
    const pkg = { kind: kinds.node, id: `pkg:r${pad(ri)}-p${pad(pi)}`, label: `pkg-${pad(ri)}-${pad(pi)}`, labelPrefix: 'package', role: 'package', depth: 1, lod: { minZ: 24, maxZ: 100 }, rect: { x, y, w: 272, h: 150 }, style: { strokeWidth: 2, fill: 'none' }, container: `repo:repo-${pad(ri)}`, focusable: true }
    const model = { kind: kinds.node, id: `model:r${pad(ri)}-p${pad(pi)}-m00`, label: `model-${pad(ri)}-${pad(pi)}-00.v1`, labelPrefix: 'model', role: 'model', depth: 2, lod: { minZ: 66, maxZ: 100 }, rect: { x: x + 18, y: y + 42, w: 236, h: 24 }, style: { strokeWidth: 1.25, fill: '#fff' }, container: pkg.id, selectable: true }
    records.push(pkg, model)
  }
  for (let i = 0; i < 9; i++) records.push({ kind: kinds.edge, id: `edge:repo-${pad(i)}`, from: `repo:repo-${pad(i)}`, to: `repo:repo-${pad(i + 1)}`, label: 'repo_flow', relation: 'repo_flow', depth: 0.9, lod: { minZ: 12, maxZ: 42 }, style: { strokeWidth: 1.4, dash: '10 8' } })
  let edge = 0
  for (let ri = 0; ri < 10; ri++) for (let pi = 0; pi < 4; pi++) records.push({ kind: kinds.edge, id: `edge:pkg-${pad(edge++)}`, from: `pkg:r${pad(ri)}-p${pad(pi)}`, to: `pkg:r${pad(ri)}-p${pad(pi + 1)}`, label: 'pkg_dep', relation: 'package_dep', depth: 1.6, lod: { minZ: 42, maxZ: 76 }, style: { strokeWidth: 1.1, dash: '7 5' } })
  for (let ri = 0; ri < 10; ri++) for (let pi = 0; pi < 4; pi++) records.push({ kind: kinds.edge, id: `edge:model-${pad(edge++)}`, from: `model:r${pad(ri)}-p${pad(pi)}-m00`, to: `model:r${pad(ri)}-p${pad(pi + 1)}-m00`, label: 'model_flow', relation: 'model_flow', depth: 2.5, lod: { minZ: 72, maxZ: 100 }, style: { strokeWidth: 0.9, dash: '5 4' } })
  return records.map((record) => JSON.stringify(record)).join('\n') + '\n'
}
export function makeLegacyRepoMapFixtureJsonl() { return makeRepoMapFixtureJsonl({ kind: 'legacy' }) }
function pad(value) { return String(value).padStart(2, '0') }

export function parseJsonl(text) {
  return String(text).split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line) } catch (error) { error.message = `JSONL parse error at line ${index + 1}: ${error.message}`; throw error }
  })
}
export function snapshotRecordsToCrudEvents(records) {
  return records.map((record, index) => ({ kind: 'crud.event.v1', op: 'upsert', entity_kind: normalizeRepoMapKind(record.kind), entity_id: record.id || `${record.kind}:${index}`, value: record }))
}
export function reduceModelGraph(events) {
  const policy = { kind: REPO_MAP_KINDS.policy, id: 'policy:default' }
  const nodes = new Map(), edges = new Map()
  for (const event of events) {
    if (event.kind !== 'crud.event.v1') continue
    const value = normalizeRepoMapRecord(event.value || {})
    if (event.op === 'delete') { nodes.delete(event.entity_id); edges.delete(event.entity_id); continue }
    if (value.kind === REPO_MAP_KINDS.policy) Object.assign(policy, clone(value))
    if (value.kind === REPO_MAP_KINDS.node) nodes.set(value.id, clone(value))
    if (value.kind === REPO_MAP_KINDS.edge) edges.set(value.id, clone(value))
  }
  return materializeNestedModelGraph(policy, [...nodes.values()], [...edges.values()])
}
export function materializeNestedModelGraph(policy, flatNodes, edges) {
  const repos = flatNodes.filter((n) => n.role === 'repo').map(withoutChildren)
  const packages = flatNodes.filter((n) => n.role === 'package').map(withoutChildren)
  const models = flatNodes.filter((n) => n.role === 'model').map(withoutChildren)
  const modelsByPackage = groupBy(models, (model) => model.container)
  const nestedPackages = packages.map((pkg) => ({ ...pkg, models: modelsByPackage.get(pkg.id) || [] }))
  const packagesByRepo = groupBy(nestedPackages, (pkg) => pkg.container)
  const nestedRepos = repos.map((repo) => ({ ...repo, packages: packagesByRepo.get(repo.id) || [] }))
  const graph = { kind: REPO_MAP_KINDS.world, contract: { kind: 'ui.repoMap.contract.v1', invariant: ['repo = packages[]', 'package = models[]'], boundary: 'stable read model; renderer consumes only this projection boundary' }, authority: { generatedArtifactsAreAuthority: false, uiRepoIsStateStore: false }, policy: normalizeRepoMapRecord(policy), repos: nestedRepos, packages: nestedPackages, models, nodes: [...repos, ...packages, ...models], edges: edges.map(normalizeRepoMapRecord) }
  assertNestedModelGraph(graph)
  return graph
}
export function assertNestedModelGraph(graph) {
  const errors = []
  const repoIds = new Set(graph.repos.map((repo) => repo.id))
  const packageIds = new Set(graph.packages.map((pkg) => pkg.id))
  for (const repo of graph.repos) for (const pkg of repo.packages || []) if (pkg.container !== repo.id) errors.push(`${pkg.id} is not under ${repo.id}`)
  for (const pkg of graph.packages) {
    if (!repoIds.has(pkg.container)) errors.push(`${pkg.id} missing repo container ${pkg.container}`)
    for (const model of pkg.models || []) if (model.container !== pkg.id) errors.push(`${model.id} is not under ${pkg.id}`)
  }
  for (const model of graph.models) if (!packageIds.has(model.container)) errors.push(`${model.id} missing package container ${model.container}`)
  if (errors.length) throw new Error(`Invalid nested containment: ${errors.join('; ')}`)
  return true
}
export function projectGraph(graph, cameraInput = {}) {
  const camera = normalizeCamera(graph.policy, cameraInput)
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const focus = byId.get(camera.focusId) || graph.repos[0]
  const focusRepo = focus.role === 'repo' ? graph.repos.find((repo) => repo.id === focus.id) : graph.repos.find((repo) => repo.id === ancestorOfRole(byId, focus, 'repo')?.id) || graph.repos[0]
  let focusPackage = focus.role === 'package' ? graph.packages.find((pkg) => pkg.id === focus.id) : graph.packages.find((pkg) => pkg.id === ancestorOfRole(byId, focus, 'package')?.id)
  if (camera.z >= 66 && !focusPackage) focusPackage = graph.packages.find((pkg) => pkg.container === focusRepo?.id)
  const nodes = selectNodes(graph, camera.z, focusRepo, focusPackage).map(withoutChildren)
  const visibleIds = new Set(nodes.map((node) => node.id))
  const edges = capEdges(graph.edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to) && isVisibleByZ(edge, camera.z)), graph.policy.edge, camera)
  return { kind: REPO_MAP_KINDS.projection, contract: { kind: 'ui.repoMap.projectionContract.v1', sourceInvariant: ['repo = packages[]', 'package = models[]'], spatialInvariant: ['package rect inside repo rect', 'model rect inside package rect'], readModelBoundary: true }, authority: { generatedArtifactsAreAuthority: false, uiRepoIsStateStore: false }, camera: { ...camera, focusRepoId: focusRepo?.id || null, focusPackageId: focusPackage?.id || null }, policy: graph.policy, nodes, edges }
}
export function normalizeRepoMapProjection(view) {
  if (!view || typeof view !== 'object') throw new Error('repo map projection input must be a JSON object')
  if (![LEGACY_REPO_MAP_KINDS.projection, REPO_MAP_KINDS.projection].includes(view.kind)) throw new Error(`unsupported repo map projection kind: ${view.kind || 'missing'}`)
  if (!Array.isArray(view.nodes)) throw new Error('repo map projection missing nodes[]')
  if (!Array.isArray(view.edges)) throw new Error('repo map projection missing edges[]')
  return { ...clone(view), kind: REPO_MAP_KINDS.projection, authority: { generatedArtifactsAreAuthority: false, uiRepoIsStateStore: false, ...(view.authority || {}) }, camera: view.camera || { z: 0 }, policy: view.policy ? normalizeRepoMapRecord(view.policy) : defaultPolicyFromProjection(view), nodes: view.nodes.map(normalizeRepoMapRecord), edges: view.edges.map(normalizeRepoMapRecord), contract: view.contract || { kind: 'ui.repoMap.projectionContract.v1', sourceInvariant: ['repo = packages[]', 'package = models[]'], readModelBoundary: true } }
}
export function loadRepoMapRuntimeInput(input) {
  if (!input || input.mode === 'jsonl') {
    const graph = reduceModelGraph(snapshotRecordsToCrudEvents(parseJsonl(input?.jsonl || '')))
    return { kind: 'ui.repoMap.runtimeInput.v1', mode: 'jsonl', graph, project: (camera = {}) => projectGraph(graph, camera) }
  }
  if (input.mode === 'projection') {
    const projection = normalizeRepoMapProjection(input.projection)
    const graph = graphShellFromProjection(projection)
    return { kind: 'ui.repoMap.runtimeInput.v1', mode: 'projection', graph, project: (camera = {}) => normalizeRepoMapProjection({ ...projection, camera: { ...projection.camera, ...camera } }) }
  }
  throw new Error(`unsupported repo map runtime input mode: ${input.mode}`)
}
export function normalizeRepoMapRecord(record) { const next = clone(record); next.kind = normalizeRepoMapKind(next.kind); return next }
export function normalizeRepoMapKind(kind) {
  if (kind === LEGACY_REPO_MAP_KINDS.policy) return REPO_MAP_KINDS.policy
  if (kind === LEGACY_REPO_MAP_KINDS.node) return REPO_MAP_KINDS.node
  if (kind === LEGACY_REPO_MAP_KINDS.edge) return REPO_MAP_KINDS.edge
  if (kind === LEGACY_REPO_MAP_KINDS.world) return REPO_MAP_KINDS.world
  if (kind === LEGACY_REPO_MAP_KINDS.projection) return REPO_MAP_KINDS.projection
  return kind
}
function graphShellFromProjection(projection) { return { kind: REPO_MAP_KINDS.world, contract: projection.contract, authority: projection.authority, policy: projection.policy || defaultPolicyFromProjection(projection), nodes: projection.nodes, edges: projection.edges, repos: [], packages: [], models: [] } }
function defaultPolicyFromProjection(projection) { return { kind: REPO_MAP_KINDS.policy, id: 'policy:projection', initialFocus: projection.camera?.focusId || projection.nodes[0]?.id || null, initialSelected: projection.camera?.selectedId || '', world: projectionWorld(projection), camera: { z: projection.camera?.z ?? 0, minZ: 0, maxZ: 100, svgPanZoomMaxZoom: 16 }, font: { basePx: 15, minPx: 4, maxPx: 16, zoomGain: 0.12, depthDecay: 0.7 }, edge: { maxVisibleRepo: 9, maxVisiblePackage: 16, maxVisibleModel: 24 } } }
function projectionWorld(projection) { if (projection.policy?.world) return projection.policy.world; if (!projection.nodes?.length) return { x: 0, y: 0, w: 1000, h: 700 }; let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity; for (const node of projection.nodes) { const r = node.rect || { x: 0, y: 0, w: 1, h: 1 }; minX = Math.min(minX, r.x); minY = Math.min(minY, r.y); maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h); } return { x: minX - 80, y: minY - 80, w: Math.max(320, maxX - minX + 160), h: Math.max(240, maxY - minY + 160) } }
function normalizeCamera(policy, input) { const minZ = policy.camera?.minZ ?? 0, maxZ = policy.camera?.maxZ ?? 100; return { z: clamp(input.z ?? policy.camera?.z ?? minZ, minZ, maxZ), focusId: input.focusId || policy.initialFocus || null, selectedId: input.selectedId ?? policy.initialSelected ?? null } }
function selectNodes(graph, z, focusRepo, focusPackage) { if (z < 24) return graph.repos.filter((repo) => isVisibleByZ(repo, z)); if (z < 66) return [focusRepo, ...(focusRepo?.packages || [])].filter((node) => isVisibleByZ(node, z)); const context = (focusRepo?.packages || []).filter((pkg) => pkg.id === focusPackage?.id || siblingPackage(pkg.id, focusPackage?.id)); return [...context, ...context.flatMap((pkg) => pkg.models || [])].filter((node) => isVisibleByZ(node, z)) }
function capEdges(edges, policy = {}, camera) { const limit = camera.z < 42 ? policy.maxVisibleRepo ?? 8 : camera.z < 70 ? policy.maxVisiblePackage ?? 16 : policy.maxVisibleModel ?? 24; return edges.slice(0, limit) }
function isVisibleByZ(record, z) { return z >= (record.lod?.minZ ?? 0) && z <= (record.lod?.maxZ ?? 100) }
function siblingPackage(a, b) { const x = String(a||'').match(/^pkg:r(\d+)-p(\d+)/), y = String(b||'').match(/^pkg:r(\d+)-p(\d+)/); return x && y && x[1] === y[1] && Math.abs(Number(x[2]) - Number(y[2])) <= 1 }
function ancestorOfRole(byId, node, role) { let cursor = node; while (cursor?.container) { cursor = byId.get(cursor.container); if (cursor?.role === role) return cursor } return null }
function groupBy(items, keyFn) { const map = new Map(); for (const item of items) { const key = keyFn(item); if (!map.has(key)) map.set(key, []); map.get(key).push(item) } return map }
function withoutChildren(node) { const { packages, models, ...rest } = node; return rest }
function clone(value) { return JSON.parse(JSON.stringify(value)) }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)) }
