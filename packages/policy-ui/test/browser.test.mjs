import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

test('four authored shells expose only the inert OPS composition slot', async () => {
  for (const name of ['index', 'control', 'task', 'graph']) {
    const html = await readFile(new URL(`assets/${name}.html`, root), 'utf8')
    assert.match(html, /<!doctype html>/i)
    assert.match(html, /<title><\/title>/)
    assert.doesNotMatch(html, /<title>[^<]+<\/title>/)
    assert.equal((html.match(/<!--POLICY_APP_BOOTSTRAP-->/g) ?? []).length, 1)
    assert.doesNotMatch(html, /<script\b/)
    assert.doesNotMatch(html, /\/(?:control|tasks)\.jsonl|\/document\.json/)
  }
})

test('browser modules consume inert configuration and keep policy routing external', async () => {
  const control = await readFile(new URL('src/control.mjs', root), 'utf8')
  const graph = await readFile(new URL('src/graph.mjs', root), 'utf8')
  assert.match(control, /#policy-app-config/)
  assert.match(graph, /#policy-app-config/)
  assert.match(control, /config\.labels\?\.title[\s\S]*document\.title = config\.labels\.title/)
  assert.match(graph, /config\.labels\?\.title[\s\S]*document\.title = config\.labels\.title/)
  assert.match(control, /config\.endpoints\.control/)
  assert.match(graph, /config\.endpoints\.document/)
  assert.doesNotMatch(`${control}\n${graph}`, /https?:|localhost|4173/)
})
