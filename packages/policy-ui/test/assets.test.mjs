import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

test('logical manifest exactly identifies verified route-free assets', async () => {
  const manifest = JSON.parse(await readFile(new URL('asset-manifest.json', root), 'utf8'))
  assert.equal(manifest.schema, 1)
  assert.deepEqual(manifest.assets.map(asset => asset.id), ['shell.index', 'shell.control', 'shell.task', 'shell.graph', 'module.control', 'module.graph', 'style.graph'])
  for (const asset of manifest.assets) {
    assert.deepEqual(Object.keys(asset), ['id', 'file', 'contentType', 'sha256'])
    assert.match(asset.file, /^assets\/[a-z.-]+$/)
    assert.equal(asset.sha256, createHash('sha256').update(await readFile(new URL(asset.file, root))).digest('hex'))
    assert.equal(Object.hasOwn(asset, 'route'), false)
  }
})
test('package surface and payload are library-only', async () => {
  const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
  assert.equal(manifest.name, '@roccho/policy-ui')
  assert.deepEqual(manifest.exports, { './asset-manifest.json': './asset-manifest.json', './control-graph': './src/control-graph.mjs' })
  assert.equal(manifest.exports['.'], undefined)
  const sources = await Promise.all(['src/control.mjs', 'src/graph.mjs'].map(file => readFile(new URL(file, root), 'utf8')))
  sources.forEach(source => assert.doesNotMatch(source, /\/control\.jsonl|\/tasks\.jsonl|\/document\.json|createServer|node:fs/))
})
