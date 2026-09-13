import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

test('package exposes only the generic document and mounted-editor surface', async () => {
  const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
  assert.equal(manifest.name, '@roccho/graph-editor')
  assert.equal(manifest.version, '0.1.0')
  assert.equal(manifest.dependencies['@maxgraph/core'], '0.24.0')
  assert.deepEqual(manifest.exports, { '.': './src/index.mjs', './style.css': './style.css' })
  const surface = await import('../src/index.mjs')
  assert.deepEqual(Object.keys(surface).sort(), ['mountGraphEditor', 'normalizeDocument', 'stringifyDocument'])
  const index = await readFile(new URL('src/index.mjs', root), 'utf8')
  assert.match(index, /normalizeDocument, stringifyDocument/)
  assert.match(index, /mountGraphEditor/)
  const sources = await Promise.all(['index.mjs', 'model.mjs', 'editor.mjs', 'component.mjs'].map(name => readFile(new URL(`src/${name}`, root), 'utf8')))
  const joined = sources.join('\n')
  assert.doesNotMatch(joined, /\bclass\s/)
  assert.doesNotMatch(joined, /https?:|\/document\.json|control\.html|task\.html|policy\.app|\b412\b/i)
  assert.match(sources[2], /setCellsMovable\(false\)/)
  assert.match(sources[2], /ConnectionHandler/)
  assert.match(sources[2], /const replayListener = \(\) => onChange\(\)[\s\S]*undoManager\.addListener\(InternalEvent\.UNDO, replayListener\)[\s\S]*undoManager\.addListener\(InternalEvent\.REDO, replayListener\)/)
})
