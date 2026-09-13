import { connectControl as connect, parseControl as parse, scanLines } from './control-graph.mjs'

const config = JSON.parse(document.querySelector('#policy-app-config').textContent)
if (typeof config.labels?.title !== 'string' || !config.labels.title.trim()) throw new Error('config.labels.title required')
document.title = config.labels.title
const element = (tag, text, className) => { const value = document.createElement(tag); if (text != null) value.textContent = text; if (className) value.className = className; return value }

const mountIndex = () => {
  const root = document.querySelector('#app')
  root.append(element('h1', config.labels.heading))
  const nav = element('nav')
  config.links.forEach(link => { const anchor = element('a'); anchor.href = link.href; anchor.append(element('b', link.label), element('small', link.detail)); nav.append(anchor) })
  root.append(nav)
}

const mountTask = () => {
  const root = document.querySelector('#app')
  root.append(element('h1', config.labels.heading), element('p', config.labels.message))
  const link = element('a', config.labels.link)
  link.href = config.endpoints.tasks
  root.append(link)
}

const mountControl = async () => {
  const mount = document.querySelector('#tree'), dialog = document.querySelector('#editor'), input = document.querySelector('#record-editor'), errorOutput = document.querySelector('#editor-error'), status = document.querySelector('#status'), saveButton = document.querySelector('#save')
  let source = '', etag = '', graph, editMode, editRecord, editKey, returnFocus, saving = false, relationSequence = 0
  const showStatus = (message, error = false) => { status.textContent = message; status.classList.toggle('error', error) }
  const action = (label, handler, disabled = false) => { const button = element('button', label); button.type = 'button'; button.disabled = disabled; button.addEventListener('click', handler); return button }
  const property = (record, key, value) => {
    const locked = key === 'id', item = element(locked ? 'span' : 'button', null, 'property')
    if (!locked) { item.type = 'button'; item.addEventListener('click', () => openEditor('update', record, key, item)) }
    item.dataset.key = key; item.append(element('span', `${key}:`, 'property-key'), element('span', typeof value === 'string' ? value : JSON.stringify(value), 'property-value')); return item
  }
  const setSaving = value => { saving = value; saveButton.disabled = value }
  const render = (record, children) => {
    const nested = children.get(record.id), node = element('section', null, 'node'), row = element('div', null, 'row'), properties = element('div', null, 'properties')
    Object.entries(record).forEach(([key, value]) => properties.append(property(record, key, value))); row.append(properties)
    const branches = element('div')
    if (nested.length) {
      const groups = new Map(); nested.forEach(child => { if (!groups.has(child.rel.kind)) groups.set(child.rel.kind, []); groups.get(child.rel.kind).push(child) })
      const controls = element('div', null, 'relation-controls')
      groups.forEach((members, kind) => { const branch = element('div', null, 'children'); branch.id = `relation-${++relationSequence}`; members.forEach(child => branch.append(render(child, children))); let open = kind !== 'details'; const toggle = action('', () => setOpen(!open)); const setOpen = value => { open = value; branch.hidden = !open; toggle.textContent = `${open ? '▾' : '▸'} ${kind} ${members.length}` }; setOpen(open); controls.append(toggle); branches.append(branch) })
      row.append(controls)
    }
    const actions = element('div', null, 'actions'), create = action('create', event => openEditor('create', record, 'id', event.currentTarget)); actions.append(action('delete', () => removeRecord(record), record.rel === null || nested.length > 0), create); row.append(actions); node.append(row); if (nested.length) node.append(branches); return node
  }
  const renderTree = () => { relationSequence = 0; mount.replaceChildren(render(graph.root, graph.children)) }
  const read = async () => { const response = await fetch(config.endpoints.control, { cache: 'no-store' }); if (!response.ok) throw new Error(`${response.status} ${response.statusText}`); etag = response.headers.get('etag'); if (!etag) throw new Error('ETag required'); source = await response.text(); graph = connect(parse(source)); renderTree() }
  const put = async candidate => { connect(parse(candidate)); if (saving) throw new Error('save in progress'); setSaving(true); try { const response = await fetch(config.endpoints.control, { method: 'PUT', headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'If-Match': etag }, body: candidate }); const body = await response.text(); if (!response.ok) throw new Error(response.status === 412 ? config.labels.stale : `${response.status}: ${body.trim()}`); const result = JSON.parse(body); etag = result.etag; source = candidate; graph = connect(parse(source)); renderTree(); showStatus(config.labels.saved) } finally { setSaving(false) } }
  const openEditor = (mode, record, key, trigger) => { if (saving) return; editMode = mode; editRecord = record; editKey = key; returnFocus = trigger; errorOutput.textContent = ''; document.querySelector('#editor-title').textContent = `${mode} · ${record.id} · ${key}`; input.value = JSON.stringify(mode === 'update' ? { ...record } : { id: '', rel: { parent: record.id, kind: '' } }, null, 2); dialog.showModal(); input.focus() }
  const candidate = () => { const value = JSON.parse(input.value); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('object required'); const line = editRecord.sourceLine, encoded = JSON.stringify(value); if (editMode === 'update') { if (value.id !== editRecord.id || value.rel?.parent !== editRecord.rel?.parent) throw new Error('id and rel.parent are immutable'); return source.slice(0, line.start) + encoded + source.slice(line.bodyEnd) } if (value.rel?.parent !== editRecord.id) throw new Error('rel.parent is fixed'); const delimiter = line.delimiter || scanLines(source).find(item => item.delimiter)?.delimiter || '\n'; return source.slice(0, line.end) + (line.delimiter ? encoded + delimiter : delimiter + encoded) + source.slice(line.end) }
  const removeRecord = async record => { if (record.rel === null || graph.children.get(record.id).length || !window.confirm(`${config.labels.delete} ${record.id}?`)) return; const line = record.sourceLine; try { await put(source.slice(0, line.start) + source.slice(line.end)) } catch (error) { showStatus(error.message, true) } }
  document.querySelector('#cancel').addEventListener('click', () => dialog.close()); saveButton.addEventListener('click', async () => { try { await put(candidate()); dialog.close() } catch (error) { errorOutput.textContent = error.message } }); dialog.addEventListener('close', () => returnFocus?.focus())
  await read()
}

try {
  if (config.view === 'index') mountIndex()
  else if (config.view === 'task') mountTask()
  else await mountControl()
} catch (error) { document.querySelector('main').replaceChildren(element('pre', error.message, 'error')) }
