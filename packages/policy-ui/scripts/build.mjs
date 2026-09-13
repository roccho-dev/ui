import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = new URL('../', import.meta.url)
const asset = name => new URL(`assets/${name}`, root)

await build({ entryPoints: [fileURLToPath(new URL('src/control.mjs', root))], outfile: fileURLToPath(asset('control.mjs')), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent' })
await build({ entryPoints: [fileURLToPath(new URL('src/graph.mjs', root))], outfile: fileURLToPath(asset('graph.mjs')), bundle: true, format: 'esm', platform: 'browser', target: 'es2022', logLevel: 'silent' })
await writeFile(asset('graph.css'), await readFile(new URL('../graph-editor/style.css', root)))

const definitions = [
  ['shell.index', 'index.html', 'text/html; charset=utf-8'],
  ['shell.control', 'control.html', 'text/html; charset=utf-8'],
  ['shell.task', 'task.html', 'text/html; charset=utf-8'],
  ['shell.graph', 'graph.html', 'text/html; charset=utf-8'],
  ['module.control', 'control.mjs', 'text/javascript; charset=utf-8'],
  ['module.graph', 'graph.mjs', 'text/javascript; charset=utf-8'],
  ['style.graph', 'graph.css', 'text/css; charset=utf-8'],
]
const assets = []
for (const [id, name, contentType] of definitions) {
  const bytes = await readFile(asset(name))
  assets.push({ id, file: `assets/${name}`, contentType, sha256: createHash('sha256').update(bytes).digest('hex') })
}
await writeFile(new URL('asset-manifest.json', root), `${JSON.stringify({ schema: 1, assets }, null, 2)}\n`)
