export function makeRepoMapFixtureJsonl() {
  const records = []
  const policy = { kind: 'map.policy.v1', id: 'policy:map', initialFocus: 'repo:repo-04', initialSelected: '', world: { x: -760, y: -420, w: 7900, h: 2700 }, camera: { z: 0, minZ: 0, maxZ: 100, svgPanZoomMaxZoom: 16 }, font: { basePx: 15, minPx: 4, maxPx: 16, zoomGain: 0.12, depthDecay: 0.7, labelWidthRatio: 0.62 }, label: { xPad: 12, yRatio: 1.2, minScreenW: 42, edgeMinScreenLength: 80 }, edge: { maxVisibleRepo: 9, maxVisiblePackage: 16, maxVisibleModel: 24 } }
  records.push(policy)
  const repos = []
  for (let i = 0; i < 10; i++) {
    const row = Math.floor(i / 5), col = i % 5
    const repo = { kind: 'map.node.v1', id: `repo:repo-${pad(i)}`, label: `repo-${pad(i)}.git`, labelPrefix: 'repo', role: 'repo', depth: 0, lod: { minZ: 0, maxZ: 100 }, rect: { x: col * 1300, y: row * 1140, w: 1040, h: 720 }, style: { strokeWidth: 3, fill: 'none' }, focusable: true }
    repos.push(repo); records.push(repo)
  }
  for (let ri = 0; ri < 10; ri++) for (let pi = 0; pi < 5; pi++) {
    const repo = repos[ri], row = Math.floor(pi / 3), col = pi % 3
    const x = repo.rect.x + 70 + col * 314, y = repo.rect.y + 95 + row * 194
    const pkg = { kind: 'map.node.v1', id: `pkg:r${pad(ri)}-p${pad(pi)}`, label: `pkg-${pad(ri)}-${pad(pi)}`, labelPrefix: 'package', role: 'package', depth: 1, lod: { minZ: 24, maxZ: 100 }, rect: { x, y, w: 272, h: 150 }, style: { strokeWidth: 2, fill: 'none' }, container: `repo:repo-${pad(ri)}`, focusable: true }
    const model = { kind: 'map.node.v1', id: `model:r${pad(ri)}-p${pad(pi)}-m00`, label: `model-${pad(ri)}-${pad(pi)}-00.v1`, labelPrefix: 'model', role: 'model', depth: 2, lod: { minZ: 66, maxZ: 100 }, rect: { x: x + 18, y: y + 42, w: 236, h: 24 }, style: { strokeWidth: 1.25, fill: '#fff' }, container: pkg.id, selectable: true }
    records.push(pkg, model)
  }
  for (let i = 0; i < 9; i++) records.push({ kind: 'map.edge.v1', id: `edge:repo-${pad(i)}`, from: `repo:repo-${pad(i)}`, to: `repo:repo-${pad(i + 1)}`, label: 'repo_flow', relation: 'repo_flow', depth: 0.9, lod: { minZ: 12, maxZ: 42 }, style: { strokeWidth: 1.4, dash: '10 8' } })
  let edge = 0
  for (let ri = 0; ri < 10; ri++) for (let pi = 0; pi < 4; pi++) records.push({ kind: 'map.edge.v1', id: `edge:pkg-${pad(edge++)}`, from: `pkg:r${pad(ri)}-p${pad(pi)}`, to: `pkg:r${pad(ri)}-p${pad(pi + 1)}`, label: 'pkg_dep', relation: 'package_dep', depth: 1.6, lod: { minZ: 42, maxZ: 76 }, style: { strokeWidth: 1.1, dash: '7 5' } })
  for (let ri = 0; ri < 10; ri++) for (let pi = 0; pi < 4; pi++) records.push({ kind: 'map.edge.v1', id: `edge:model-${pad(edge++)}`, from: `model:r${pad(ri)}-p${pad(pi)}-m00`, to: `model:r${pad(ri)}-p${pad(pi + 1)}-m00`, label: 'model_flow', relation: 'model_flow', depth: 2.5, lod: { minZ: 72, maxZ: 100 }, style: { strokeWidth: 0.9, dash: '5 4' } })
  return records.map((record) => JSON.stringify(record)).join('\n') + '\n'
}
function pad(value) { return String(value).padStart(2, '0') }

export function parseJsonl(text) {
  return String(text).split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line) } catch (error) { error.message = `JSONL parse error at line ${index + 1}: ${error.message}`; throw error }
  })
}
export function snapshotRecordsToCrudEvents(records) {
  return records.map((record, index) => ({ kind: 'crud.event.v1', op: 'upsert', entity_kind: record.kind, entity_id: record.id || `${record.kind}:${index}`, value: record }))
}
export function reduceModelGraph(events) {
  const policy = { kind: 'map.policy.v1', id: 'policy:default' }
  const nodes = new Map(), edges = new Map()
  for (const event of events) {
    if (event.kind !== 'crud.event.v1') continue
    const value = event.value || {}
    if (event.op === 'delete') { nodes.delete(event.entity_id); edges.delete(event.entity_id); continue }
    if (value.kind === 'map.policy.v1') Object.assign(policy, clone(value))
    if (value.kind === 'map.node.v1') nodes.set(value.id, clone(value))
    if (value.kind === 'map.edge.v1') edges.set(value.id, clone(value))
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
  const graph = { kind: 'model.graph.v1', contract: { kind: 'model.graph.contract.v1', invariant: ['repo = packages[]', 'package = models[]'] }, policy, repos: nestedRepos, packages: nestedPackages, models, nodes: [...repos, ...packages, ...models], edges }
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
  return { kind: 'projection.view.v1', contract: { sourceInvariant: ['repo = packages[]', 'package = models[]'], spatialInvariant: ['package rect inside repo rect', 'model rect inside package rect'] }, camera: { ...camera, focusRepoId: focusRepo?.id || null, focusPackageId: focusPackage?.id || null }, policy: graph.policy, nodes, edges }
}
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
