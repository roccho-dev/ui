import { activeCells, activeList, createState, editorView, reduce } from './model.mjs'
import { createEditor } from './editor.mjs'

const defaults = {
  heading: 'Graph editor',
  scope: '',
  backLabel: '',
  backHref: '',
  canvasLabel: 'Editable graph canvas',
  activeCells: 'Active frame cells',
  loading: 'Loading…',
  loaded: 'Loaded',
  unsaved: 'Unsaved changes',
  saved: 'Saved',
  emptyLabel: '(empty)',
  unavailable: 'Unavailable',
  loadFailed: 'Load failed',
  saveFailed: 'Save failed',
  reloadCancelled: 'Reload cancelled; unsaved changes preserved',
  confirmReload: 'Discard unsaved changes and reload?',
  pointerHelp: 'Pointer is available only for selection, edge connection, and edge reconnection.',
}

const element = (tag, text, className) => {
  const node = document.createElement(tag)
  if (text != null) node.textContent = text
  if (className) node.className = className
  return node
}

const requireCallback = (value, name) => {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`)
  return value
}

export const mountGraphEditor = (root, options = {}) => {
  if (!(root instanceof Element)) throw new TypeError('root must be an Element')
  const labels = { ...defaults, ...(options.labels ?? {}) }
  const loadDocument = requireCallback(options.load, 'load')
  const saveDocument = requireCallback(options.save, 'save')
  const shell = element('div', null, 'roccho-graph-editor')
  if (labels.backLabel) {
    const back = element('a', labels.backLabel)
    back.href = labels.backHref
    shell.append(back)
  }
  shell.append(element('h1', labels.heading, 'roccho-graph-editor__heading'))
  if (labels.scope) shell.append(element('p', labels.scope, 'roccho-graph-editor__scope'))
  const frame = element('section', null, 'roccho-graph-editor__frame')
  const frameHeader = element('header', null, 'roccho-graph-editor__frame-header')
  const frameOutput = element('output', null, 'roccho-graph-editor__frame-output')
  const status = element('output', labels.loading, 'roccho-graph-editor__status')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  frameHeader.append(frameOutput, status)
  const body = element('div', null, 'roccho-graph-editor__body')
  const viewport = element('div', null, 'roccho-graph-editor__viewport')
  viewport.tabIndex = 0
  viewport.setAttribute('role', 'region')
  viewport.setAttribute('aria-label', labels.canvasLabel)
  const canvas = element('div', null, 'roccho-graph-editor__canvas')
  viewport.append(canvas)
  const projection = element('aside', null, 'roccho-graph-editor__projection')
  const projectionHeading = element('h2', labels.activeCells, 'roccho-graph-editor__projection-heading')
  const semanticList = element('ul')
  projection.append(projectionHeading, semanticList)
  body.append(viewport, projection)
  const help = element('footer', null, 'roccho-graph-editor__help')
  const helpHint = element('p')
  const keymapList = element('ul')
  keymapList.id = `roccho-graph-keymap-${crypto.randomUUID()}`
  keymapList.hidden = true
  keymapList.setAttribute('aria-label', 'Keyboard shortcuts')
  help.append(helpHint, keymapList)
  frame.append(frameHeader, body, help)
  shell.append(frame)
  root.replaceChildren(shell)

  let state
  let etag = ''
  let dirty = false
  let destroyed = false
  let editor
  const setStatus = (message, error = false) => {
    status.textContent = message
    status.classList.toggle('roccho-graph-editor__status--error', error)
  }
  const renderActiveList = () => {
    if (!state) return
    const rows = activeList(activeCells(state)).map(item => {
      const row = element('li')
      const description = item.description.replace('(empty)', labels.emptyLabel)
      const button = element('button', description)
      button.type = 'button'
      button.dataset.cellId = item.id
      row.append(button)
      return row
    })
    semanticList.replaceChildren(...rows)
  }
  const refresh = () => {
    if (!state) return
    const view = editorView(state)
    frameOutput.value = `${view.mapIndex + 1} / ${view.mapCount} · ${view.mapTitle} — ${view.timeIndex + 1} / ${view.timeCount} · ${view.timeTitle}`
    renderActiveList()
  }
  const synchronize = () => {
    editor.stopEditing()
    state = reduce(state, { type: 'replace-active-cells', cells: editor.readCells() })
  }
  const move = eventType => {
    try {
      synchronize()
      const next = reduce(state, { type: eventType })
      if (next === state) return
      state = next
      const view = editorView(state)
      editor.configure(view.canvas)
      editor.replaceCells(activeCells(state))
      setStatus(dirty ? labels.unsaved : labels.loaded)
      refresh()
    } catch (error) {
      setStatus(error.message, true)
    }
  }
  const load = async () => {
    try {
      const result = await loadDocument()
      state = createState(result.document)
      etag = result.etag
      const view = editorView(state)
      editor.configure(view.canvas)
      editor.replaceCells(activeCells(state))
      dirty = false
      setStatus(labels.loaded)
      refresh()
    } catch (error) {
      setStatus(`${labels.loadFailed}: ${error.message}`, true)
    }
  }
  const save = async () => {
    try {
      synchronize()
      const active = state.active
      const result = await saveDocument({ document: state.document, etag })
      state = createState(result.document, active)
      etag = result.etag
      editor.replaceCells(activeCells(state))
      dirty = false
      setStatus(labels.saved)
      refresh()
    } catch (error) {
      setStatus(`${labels.saveFailed}: ${error.message}`, true)
    }
  }
  const reload = () => {
    if (dirty && !window.confirm(labels.confirmReload)) {
      setStatus(labels.reloadCancelled)
      return
    }
    load()
  }
  const toggleKeymap = () => {
    keymapList.hidden = !keymapList.hidden
  }

  editor = createEditor({
    container: canvas,
    onChange: () => {
      if (!state || destroyed) return
      try {
        state = reduce(state, { type: 'replace-active-cells', cells: editor.readCells() })
        dirty = true
        setStatus(labels.unsaved)
        refresh()
      } catch (error) {
        setStatus(error.message, true)
      }
    },
    onSelectionChange: refresh,
  })

  const selectedOne = () => editor.selection().length === 1
  const selectedAny = () => editor.selection().length > 0
  const selectedRect = () => editor.selection().some(cell => cell.type === 'rect')
  const commands = [
    { keys: [{ key: 'PageUp' }], help: 'previous state', enabled: () => Boolean(state && reduce(state, { type: 'previous-time' }) !== state), action: () => move('previous-time') },
    { keys: [{ key: 'PageDown' }], help: 'next state', enabled: () => Boolean(state && reduce(state, { type: 'next-time' }) !== state), action: () => move('next-time') },
    { keys: [{ key: 'PageUp', command: true }], help: 'previous map', enabled: () => Boolean(state && reduce(state, { type: 'previous-map' }) !== state), action: () => move('previous-map') },
    { keys: [{ key: 'PageDown', command: true }], help: 'next map', enabled: () => Boolean(state && reduce(state, { type: 'next-map' }) !== state), action: () => move('next-map') },
    { keys: [{ key: 'Insert' }], help: 'insert a rectangle and edit its label', enabled: () => Boolean(state && editorView(state).canvas.width >= 160 && editorView(state).canvas.height >= 56), action: () => editor.insertRectangle() },
    { keys: [{ key: 'Enter' }, { key: 'F2' }], help: 'edit the selected label', enabled: selectedOne, action: () => editor.editLabel() },
    { keys: [{ key: 'Delete' }, { key: 'Backspace' }], help: 'delete the selection', enabled: selectedAny, action: () => editor.deleteSelection() },
    {
      keys: [
        { key: 'ArrowLeft', shift: 'optional', dx: -1, dy: 0 }, { key: 'ArrowRight', shift: 'optional', dx: 1, dy: 0 },
        { key: 'ArrowUp', shift: 'optional', dx: 0, dy: -1 }, { key: 'ArrowDown', shift: 'optional', dx: 0, dy: 1 },
      ],
      help: 'nudge selected rectangles 1 px (Shift: 10 px)',
      enabled: selectedRect,
      action: (event, binding) => editor.nudge(binding.dx * (event.shiftKey ? 10 : 1), binding.dy * (event.shiftKey ? 10 : 1)),
    },
    { keys: [{ key: 'z', command: true }], help: 'undo', enabled: () => editor.canUndo(), action: () => editor.undo() },
    { keys: [{ key: 'z', command: true, shift: true }, { key: 'y', command: true }], help: 'redo', enabled: () => editor.canRedo(), action: () => editor.redo() },
    { keys: [{ key: 's', command: true }], help: 'save', enabled: () => Boolean(state && etag), action: save },
    { keys: [{ key: 'l', command: true, shift: true }], help: 'reload', enabled: () => Boolean(state), action: reload },
    { keys: [{ key: '/', command: true }], help: 'toggle the keyboard shortcut list', enabled: () => Boolean(state), action: toggleKeymap },
  ]
  const normalizedKey = key => key.length === 1 ? key.toLowerCase() : key
  const bindingMatches = (event, binding) => {
    if (normalizedKey(event.key) !== normalizedKey(binding.key) || event.altKey) return false
    const commandPressed = event.ctrlKey || event.metaKey
    if (commandPressed !== Boolean(binding.command)) return false
    if (binding.command && event.ctrlKey === event.metaKey) return false
    return binding.shift === 'optional' || event.shiftKey === Boolean(binding.shift)
  }
  const bindingLabel = binding => {
    const parts = []
    if (binding.command) parts.push('Ctrl/Cmd')
    if (binding.shift === true) parts.push('Shift')
    parts.push(binding.key.length === 1 ? binding.key.toUpperCase() : binding.key)
    return parts.join('+')
  }
  const commandLabel = command => `${command.keys.map(bindingLabel).join(' / ')} — ${command.help}`
  const toggleCommand = commands.at(-1)
  helpHint.textContent = `${commandLabel(toggleCommand)}. ${labels.pointerHelp}`
  keymapList.replaceChildren(...commands.map(command => element('li', commandLabel(command))))
  viewport.setAttribute('aria-keyshortcuts', toggleCommand.keys.flatMap(binding => [`Control+${binding.key}`, `Meta+${binding.key}`]).join(' '))
  viewport.setAttribute('aria-controls', keymapList.id)
  const selectSemanticCell = event => {
    const button = event.target.closest?.('button[data-cell-id]')
    if (!button || !semanticList.contains(button) || !editor.selectById(button.dataset.cellId)) return
    viewport.focus()
  }
  const handleKeydown = event => {
    if (event.target.closest?.('input, textarea, select, button, [contenteditable=true], .mxCellEditor')) return
    const match = commands.flatMap(command => command.keys.map(binding => ({ command, binding }))).find(candidate => bindingMatches(event, candidate.binding))
    if (!match || !match.command.enabled()) return
    event.preventDefault()
    match.command.action(event, match.binding)
    refresh()
  }
  semanticList.addEventListener('click', selectSemanticCell)
  viewport.addEventListener('keydown', handleKeydown)
  load()

  return {
    destroy: () => {
      if (destroyed) return
      destroyed = true
      semanticList.removeEventListener('click', selectSemanticCell)
      viewport.removeEventListener('keydown', handleKeydown)
      editor.destroy()
      root.replaceChildren()
    },
  }
}
