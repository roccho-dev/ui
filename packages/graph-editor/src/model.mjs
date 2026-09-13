const invalid = message => {
  const error = new TypeError(`Invalid document: ${message}`)
  error.code = 'INVALID_DOCUMENT'
  throw error
}

const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const exactKeys = (value, keys, location) => {
  if (!plainObject(value)) invalid(`${location} must be an object`)
  const expected = new Set(keys)
  for (const key of keys) if (!Object.hasOwn(value, key)) invalid(`${location}.${key} is required`)
  for (const key of Object.keys(value)) if (!expected.has(key)) invalid(`${location}.${key} is not supported`)
}
const textId = (value, location) => {
  if (typeof value !== 'string' || !value || value !== value.trim()) invalid(`${location} must be a non-empty trimmed string`)
  return value
}
const title = (value, location) => {
  if (typeof value !== 'string' || !value.trim()) invalid(`${location} must be non-empty text`)
  return value
}
const label = (value, location) => {
  if (typeof value !== 'string') invalid(`${location} must be a string`)
  return value
}
const finite = (value, location) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(`${location} must be finite`)
  return value
}
const compareText = (left, right) => left === right ? 0 : left < right ? -1 : 1
const typeRank = new Map([['rect', 0], ['edge.arrow', 1]])
const cellOrder = (left, right) => typeRank.get(left.type) - typeRank.get(right.type) || compareText(left.id, right.id)
const canonicalCells = cells => [...cells].sort(cellOrder)

const normalizeCell = (value, location, canvas) => {
  if (!plainObject(value)) invalid(`${location} must be an object`)
  if (value.type === 'rect') {
    exactKeys(value, ['id', 'type', 'label', 'x', 'y', 'width', 'height'], location)
    const cell = {
      id: textId(value.id, `${location}.id`),
      type: 'rect',
      label: label(value.label, `${location}.label`),
      x: finite(value.x, `${location}.x`),
      y: finite(value.y, `${location}.y`),
      width: finite(value.width, `${location}.width`),
      height: finite(value.height, `${location}.height`),
    }
    if (cell.x < 0 || cell.y < 0 || cell.width <= 0 || cell.height <= 0) invalid(`${location} must have positive size and non-negative position`)
    if (cell.x + cell.width > canvas.width || cell.y + cell.height > canvas.height) invalid(`${location} must fit canvas`)
    return cell
  }
  if (value.type === 'edge.arrow') {
    exactKeys(value, ['id', 'type', 'label', 'source', 'target'], location)
    return {
      id: textId(value.id, `${location}.id`),
      type: 'edge.arrow',
      label: label(value.label, `${location}.label`),
      source: textId(value.source, `${location}.source`),
      target: textId(value.target, `${location}.target`),
    }
  }
  invalid(`${location}.type must be rect or edge.arrow`)
}

const normalizeCells = (values, location, canvas) => {
  if (!Array.isArray(values)) invalid(`${location} must be an array`)
  const cells = values.map((value, index) => normalizeCell(value, `${location}[${index}]`, canvas))
  const frame = new Map()
  for (const cell of cells) {
    if (frame.has(cell.id)) invalid(`${location} contains duplicate ${cell.id}`)
    frame.set(cell.id, cell)
  }
  for (const cell of frame.values()) {
    if (cell.type !== 'edge.arrow') continue
    if (frame.get(cell.source)?.type !== 'rect') invalid(`${location}: ${cell.id}.source does not reference a rect`)
    if (frame.get(cell.target)?.type !== 'rect') invalid(`${location}: ${cell.id}.target does not reference a rect`)
  }
  return canonicalCells(frame.values())
}

export const normalizeDocument = value => {
  exactKeys(value, ['schema', 'canvas', 'maps'], 'root')
  if (value.schema !== 3) invalid('root.schema must be 3')
  exactKeys(value.canvas, ['width', 'height'], 'root.canvas')
  const canvas = {
    width: finite(value.canvas.width, 'root.canvas.width'),
    height: finite(value.canvas.height, 'root.canvas.height'),
  }
  if (!Number.isInteger(canvas.width) || !Number.isInteger(canvas.height) || canvas.width < 1 || canvas.height < 1 || canvas.width > 8192 || canvas.height > 8192) invalid('root.canvas dimensions must be integers from 1 through 8192')
  if (!Array.isArray(value.maps) || value.maps.length < 1) invalid('root.maps must contain at least one map')
  const mapIds = new Set()
  const maps = value.maps.map((map, mapIndex) => {
    const location = `root.maps[${mapIndex}]`
    exactKeys(map, ['id', 'title', 'timeline'], location)
    const mapId = textId(map.id, `${location}.id`)
    if (mapIds.has(mapId)) invalid(`${location}.id is duplicated`)
    mapIds.add(mapId)
    if (!Array.isArray(map.timeline) || map.timeline.length < 1) invalid(`${location}.timeline must contain at least one state`)
    const stateIds = new Set()
    const timeline = map.timeline.map((state, timeIndex) => {
      const stateLocation = `${location}.timeline[${timeIndex}]`
      exactKeys(state, ['id', 'title', 'cells'], stateLocation)
      const stateId = textId(state.id, `${stateLocation}.id`)
      if (stateIds.has(stateId)) invalid(`${stateLocation}.id is duplicated`)
      stateIds.add(stateId)
      return {
        id: stateId,
        title: title(state.title, `${stateLocation}.title`),
        cells: normalizeCells(state.cells, `${stateLocation}.cells`, canvas),
      }
    })
    return { id: mapId, title: title(map.title, `${location}.title`), timeline }
  })
  return { schema: 3, canvas, maps }
}

export const stringifyDocument = value => `${JSON.stringify(normalizeDocument(value), null, 2)}\n`

const normalizeActive = (document, active) => {
  if (!plainObject(active) || !Number.isInteger(active.mapIndex) || !Number.isInteger(active.timeIndex)) invalid('active must contain integer mapIndex and timeIndex')
  if (active.mapIndex < 0 || active.mapIndex >= document.maps.length) invalid(`map index ${active.mapIndex} is out of range`)
  if (active.timeIndex < 0 || active.timeIndex >= document.maps[active.mapIndex].timeline.length) invalid(`time index ${active.timeIndex} is out of range`)
  return { mapIndex: active.mapIndex, timeIndex: active.timeIndex }
}

export const createState = (value, active = { mapIndex: 0, timeIndex: 0 }) => {
  const document = normalizeDocument(value)
  return { document, active: normalizeActive(document, active) }
}

export const activeCells = state => state.document.maps[state.active.mapIndex].timeline[state.active.timeIndex].cells

export const editorView = state => {
  const map = state.document.maps[state.active.mapIndex]
  const moment = map.timeline[state.active.timeIndex]
  return {
    canvas: state.document.canvas,
    mapIndex: state.active.mapIndex,
    mapCount: state.document.maps.length,
    mapTitle: map.title,
    timeIndex: state.active.timeIndex,
    timeCount: map.timeline.length,
    timeTitle: moment.title,
  }
}

export const activeList = cells => canonicalCells(cells).map(cell => ({
  id: cell.id,
  type: cell.type,
  label: cell.label,
  description: cell.type === 'rect'
    ? `${cell.label || '(empty)'} — rect at ${cell.x}, ${cell.y}; ${cell.width} × ${cell.height}`
    : `${cell.label || '(empty)'} — arrow ${cell.source} → ${cell.target}`,
}))

export const reduce = (state, event) => {
  if (!plainObject(event) || typeof event.type !== 'string') invalid('event.type is required')
  const { mapIndex, timeIndex } = state.active
  if (event.type === 'replace-active-cells') {
    const maps = state.document.maps.map((map, index) => index !== mapIndex ? map : {
      ...map,
      timeline: map.timeline.map((moment, time) => time !== timeIndex ? moment : { ...moment, cells: event.cells }),
    })
    const document = normalizeDocument({ ...state.document, maps })
    return { document, active: state.active }
  }
  if (event.type === 'previous-time') return timeIndex > 0 ? { ...state, active: { mapIndex, timeIndex: timeIndex - 1 } } : state
  if (event.type === 'next-time') return timeIndex + 1 < state.document.maps[mapIndex].timeline.length ? { ...state, active: { mapIndex, timeIndex: timeIndex + 1 } } : state
  if (event.type === 'previous-map') return mapIndex > 0 ? { ...state, active: { mapIndex: mapIndex - 1, timeIndex: 0 } } : state
  if (event.type === 'next-map') return mapIndex + 1 < state.document.maps.length ? { ...state, active: { mapIndex: mapIndex + 1, timeIndex: 0 } } : state
  invalid(`event type ${event.type} is not supported`)
}
