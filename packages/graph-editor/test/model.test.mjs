import assert from 'node:assert/strict'
import test from 'node:test'
import { activeCells, activeList, createState, editorView, normalizeDocument, reduce, stringifyDocument } from '../src/model.mjs'

const rect = (id, x = 0) => ({ id, type: 'rect', label: id, x, y: 0, width: 20, height: 20 })
const document = () => ({
  schema: 3,
  canvas: { width: 200, height: 100 },
  maps: [
    { id: 'map-b', title: 'Map B', timeline: [
      { id: 'time-1', title: 'First', cells: [rect('é', 30), rect('z', 0), { id: 'arrow', type: 'edge.arrow', label: '', source: 'z', target: 'é' }] },
      { id: 'time-2', title: 'Second', cells: [rect('later', 10)] },
    ] },
    { id: 'map-a', title: 'Map A', timeline: [{ id: 'time-1', title: 'Only', cells: [] }] },
  ],
})

test('normalization validates schema 3 and canonicalizes every independent snapshot', () => {
  const normalized = normalizeDocument(document())
  assert.deepEqual(normalized.maps[0].timeline[0].cells.map(cell => cell.id), ['z', 'é', 'arrow'])
  assert.equal(stringifyDocument(normalized).at(-1), '\n')
  assert.deepEqual(normalizeDocument(JSON.parse(stringifyDocument(normalized))), normalized)
})

test('normalization rejects exact-key, geometry, identity, and endpoint errors', () => {
  const cases = [
    { ...document(), extra: true },
    { ...document(), canvas: { width: 0, height: 100 } },
    { ...document(), maps: [] },
    { ...document(), maps: [{ id: 'x', title: 'X', timeline: [{ id: 't', title: 'T', cells: [rect('x'), rect('x')] }] }] },
    { ...document(), maps: [{ id: 'x', title: 'X', timeline: [{ id: 't', title: 'T', cells: [{ id: 'e', type: 'edge.arrow', label: '', source: 'missing', target: 'missing' }] }] }] },
  ]
  for (const value of cases) assert.throws(() => normalizeDocument(value), { code: 'INVALID_DOCUMENT' })
})

test('state reducer navigates both axes and replaces only the active full snapshot', () => {
  const initial = createState(document())
  const time = reduce(initial, { type: 'next-time' })
  assert.deepEqual(time.active, { mapIndex: 0, timeIndex: 1 })
  const replaced = reduce(time, { type: 'replace-active-cells', cells: [rect('replacement')] })
  assert.deepEqual(activeCells(replaced).map(cell => cell.id), ['replacement'])
  assert.deepEqual(initial.document.maps[0].timeline[0].cells.map(cell => cell.id), ['z', 'é', 'arrow'])
  const map = reduce(replaced, { type: 'next-map' })
  assert.deepEqual(map.active, { mapIndex: 1, timeIndex: 0 })
  assert.equal(reduce(map, { type: 'next-map' }), map)
})

test('editor and semantic-list projections describe the active state without mutation', () => {
  const state = createState(document(), { mapIndex: 0, timeIndex: 1 })
  assert.deepEqual(editorView(state), {
    canvas: { width: 200, height: 100 }, mapIndex: 0, mapCount: 2, mapTitle: 'Map B', timeIndex: 1, timeCount: 2, timeTitle: 'Second',
  })
  assert.deepEqual(activeList(activeCells(state)), [{ id: 'later', type: 'rect', label: 'later', description: 'later — rect at 10, 0; 20 × 20' }])
})
