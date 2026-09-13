import {
  BaseGraph,
  Cell,
  CellEditorHandler,
  ConnectionHandler,
  EdgeMarker,
  EdgeMarkerRegistry,
  Geometry,
  InternalEvent,
  Perimeter,
  PerimeterRegistry,
  Rectangle,
  SelectionCellsHandler,
  SelectionHandler,
  UndoManager,
} from '@maxgraph/core'

const vertexStyle = {
  perimeter: 'rectanglePerimeter', rounded: true, arcSize: 12, whiteSpace: 'wrap', html: false,
  align: 'center', verticalAlign: 'middle', fillColor: '#ffffff', strokeColor: '#3f5877',
  fontColor: '#172033', fontSize: 14,
}
const edgeStyle = {
  endArrow: 'classic', html: false, rounded: false, strokeColor: '#526b88', fontColor: '#27384d',
  fontSize: 12, labelBackgroundColor: '#ffffff',
}

export const createEditor = ({ container, onChange, onSelectionChange }) => {
  PerimeterRegistry.add('rectanglePerimeter', Perimeter.RectanglePerimeter)
  EdgeMarkerRegistry.add('classic', EdgeMarker.createArrow(2))
  const graph = new BaseGraph({
    container,
    plugins: [CellEditorHandler, ConnectionHandler, SelectionCellsHandler, SelectionHandler],
  })
  graph.setConnectable(true)
  graph.setAllowDanglingEdges(false)
  graph.setConnectableEdges(false)
  graph.setCellsMovable(false)
  graph.setCellsResizable(false)
  graph.setCellsEditable(false)
  graph.setCellsBendable(false)
  graph.setCellsCloneable(false)
  graph.setEdgeLabelsMovable(false)
  graph.setVertexLabelsMovable(false)
  graph.setAllowNegativeCoordinates(false)
  graph.setConstrainChildren(true)
  graph.isCellRotatable = () => false

  let canvas = { width: 1, height: 1 }
  let hydrating = false
  let metaByCell = new WeakMap()
  let cellById = new Map()
  const undoManager = new UndoManager(100)
  const registerCell = (runtime, logicalId, type) => {
    metaByCell.set(runtime, { id: logicalId, type })
    cellById.set(logicalId, runtime)
    return runtime
  }

  const connection = graph.getPlugin(ConnectionHandler.pluginId)
  if (!connection) throw new Error('ConnectionHandler unavailable')
  connection.factoryMethod = () => {
    const runtime = new Cell('', new Geometry(), edgeStyle)
    runtime.setEdge(true)
    runtime.getGeometry().relative = true
    return registerCell(runtime, crypto.randomUUID(), 'edge.arrow')
  }

  const readCells = () => graph.getChildCells(graph.getDefaultParent(), true, true).map(cell => {
    const meta = metaByCell.get(cell)
    if (!meta) throw new Error('cell metadata missing')
    if (meta.type === 'rect') {
      const geometry = cell.getGeometry()
      return {
        id: meta.id, type: 'rect', label: String(cell.getValue() ?? ''),
        x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height,
      }
    }
    const source = metaByCell.get(cell.getTerminal(true))
    const target = metaByCell.get(cell.getTerminal(false))
    if (!source || !target) throw new Error(`edge ${meta.id} has a missing terminal`)
    return { id: meta.id, type: 'edge.arrow', label: String(cell.getValue() ?? ''), source: source.id, target: target.id }
  })

  const configure = nextCanvas => {
    canvas = nextCanvas
    container.style.width = `${canvas.width}px`
    container.style.height = `${canvas.height}px`
    graph.maximumGraphBounds = new Rectangle(0, 0, canvas.width, canvas.height)
  }

  const replaceCells = cells => {
    hydrating = true
    try {
      graph.stopEditing(true)
      graph.clearSelection()
      metaByCell = new WeakMap()
      cellById = new Map()
      graph.batchUpdate(() => {
        const parent = graph.getDefaultParent()
        graph.removeCells(graph.getChildCells(parent, true, true), true)
        for (const cell of cells.filter(value => value.type === 'rect')) {
          registerCell(graph.insertVertex({
            parent, value: cell.label, position: [cell.x, cell.y], size: [cell.width, cell.height], style: vertexStyle,
          }), cell.id, cell.type)
        }
        for (const cell of cells.filter(value => value.type === 'edge.arrow')) {
          registerCell(graph.insertEdge({
            parent, value: cell.label, source: cellById.get(cell.source), target: cellById.get(cell.target), style: edgeStyle,
          }), cell.id, cell.type)
        }
      })
    } finally {
      hydrating = false
    }
    undoManager.clear()
  }

  const selected = () => graph.getSelectionCells()
  const selectedOne = () => selected().length === 1 ? selected()[0] : null
  const insertRectangle = () => {
    const width = 160
    const height = 56
    if (canvas.width < width || canvas.height < height) throw new Error('Canvas is too small for a 160 × 56 rectangle')
    const count = readCells().filter(cell => cell.type === 'rect').length
    const x = Math.min(24 + (count % 8) * 32, canvas.width - width)
    const y = Math.min(24 + (Math.floor(count / 8) % 8) * 32, canvas.height - height)
    let runtime
    graph.batchUpdate(() => {
      runtime = registerCell(graph.insertVertex({
        parent: graph.getDefaultParent(), value: '', position: [x, y], size: [width, height], style: vertexStyle,
      }), crypto.randomUUID(), 'rect')
    })
    graph.setSelectionCell(runtime)
    graph.startEditingAtCell(runtime)
  }
  const editLabel = () => {
    const cell = selectedOne()
    if (cell) graph.startEditingAtCell(cell)
  }
  const deleteSelection = () => {
    const cells = selected()
    if (cells.length) graph.removeCells(cells, true)
  }
  const nudge = (dx, dy) => {
    const cells = selected().filter(cell => metaByCell.get(cell)?.type === 'rect')
    const bounded = cells.map(cell => {
      const geometry = cell.getGeometry()
      return {
        cell,
        x: Math.max(0, Math.min(canvas.width - geometry.width, geometry.x + dx)),
        y: Math.max(0, Math.min(canvas.height - geometry.height, geometry.y + dy)),
      }
    })
    graph.batchUpdate(() => bounded.forEach(({ cell, x, y }) => {
      const geometry = cell.getGeometry().clone()
      geometry.x = x
      geometry.y = y
      graph.getDataModel().setGeometry(cell, geometry)
    }))
  }
  const selectById = logicalId => {
    const runtime = cellById.get(logicalId)
    if (runtime) graph.setSelectionCell(runtime)
    return Boolean(runtime)
  }
  const selection = () => selected().map(cell => metaByCell.get(cell)).filter(Boolean)
  const undoListener = (_sender, event) => {
    if (hydrating) return
    undoManager.undoableEditHappened(event.getProperty('edit'))
    onChange()
  }
  const selectionListener = () => onSelectionChange()
  const replayListener = () => onChange()
  graph.getDataModel().addListener(InternalEvent.UNDO, undoListener)
  graph.getSelectionModel().addListener(InternalEvent.CHANGE, selectionListener)
  undoManager.addListener(InternalEvent.UNDO, replayListener)
  undoManager.addListener(InternalEvent.REDO, replayListener)

  return {
    configure,
    replaceCells,
    readCells,
    stopEditing: () => graph.stopEditing(false),
    insertRectangle,
    editLabel,
    deleteSelection,
    nudge,
    selectById,
    selection,
    canUndo: () => undoManager.canUndo(),
    canRedo: () => undoManager.canRedo(),
    undo: () => undoManager.undo(),
    redo: () => undoManager.redo(),
    destroy: () => graph.destroy(),
  }
}
