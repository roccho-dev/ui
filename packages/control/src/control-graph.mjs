const invalid = message => Object.assign(new Error(message), { code: 'INVALID_CONTROL' })
const requireControl = (condition, message) => { if (!condition) throw invalid(message) }

export const scanLines = text => {
  const lines = []
  let start = 0
  for (let index = 0; index < text.length;) {
    if (text[index] !== '\r' && text[index] !== '\n') { index += 1; continue }
    const delimiter = text[index] === '\r' && text[index + 1] === '\n' ? '\r\n' : text[index]
    lines.push({ body: text.slice(start, index), start, bodyEnd: index, end: index + delimiter.length, delimiter })
    index += delimiter.length
    start = index
  }
  lines.push({ body: text.slice(start), start, bodyEnd: text.length, end: text.length, delimiter: '' })
  return lines
}
const parseLines = (text, decode) => scanLines(text).flatMap((sourceLine, index) => {
  if (!sourceLine.body.trim()) return []
  let value
  try { value = JSON.parse(sourceLine.body) } catch (error) { throw invalid(`L${index + 1}: ${error.message}`) }
  requireControl(value && !Array.isArray(value) && typeof value === 'object', `L${index + 1}: object required`)
  decode(value, index + 1)
  Object.defineProperties(value, { line: { value: index + 1 }, sourceLine: { value: sourceLine } })
  return [value]
})

export const parseControl = text => parseLines(text, (value, line) => {
  requireControl(typeof value.id === 'string' && value.id, `L${line}: id required`)
  requireControl(!Object.hasOwn(value, 'parent'), `L${line}: legacy parent prohibited`)
  requireControl(Object.hasOwn(value, 'rel'), `L${line}: rel required`)
  requireControl(value.rel === null || (value.rel && !Array.isArray(value.rel) && typeof value.rel === 'object'), `L${line}: invalid rel`)
  requireControl(value.rel === null || !Object.hasOwn(value.rel, 'child'), `L${line}: rel.child prohibited`)
  requireControl(value.rel === null || (typeof value.rel.parent === 'string' && value.rel.parent), `L${line}: rel.parent required`)
  requireControl(value.rel === null || (typeof value.rel.kind === 'string' && value.rel.kind), `L${line}: rel.kind required`)
})

export const parseClaims = (text, controlRecords) => {
  requireControl(Array.isArray(controlRecords) && controlRecords.length > 0, 'control records required for claims')
  const controlIds = new Set(controlRecords.map(record => record.id))
  const claims = parseLines(text, (value, line) => {
    requireControl(typeof value.id === 'string' && value.id, `claims L${line}: id required`)
    requireControl(value.op === 'report' || value.op === 'proposal', `claims L${line}: op must be report or proposal`)
    requireControl(value.rel && !Array.isArray(value.rel) && typeof value.rel === 'object', `claims L${line}: rel required`)
    requireControl(typeof value.rel.parent === 'string' && value.rel.parent, `claims L${line}: rel.parent required`)
    requireControl(controlIds.has(value.rel.parent), `claims L${line}: unknown control ${value.rel.parent}`)
    requireControl(value.rel.kind === 'reports', `claims L${line}: rel.kind must be reports`)
    requireControl(!Object.hasOwn(value.rel, 'child'), `claims L${line}: rel.child prohibited`)
    requireControl(typeof value.state === 'string' && value.state, `claims L${line}: state required`)
    requireControl(typeof value.by === 'string' && value.by, `claims L${line}: by required`)
    if (Object.hasOwn(value, 'at')) requireControl(typeof value.at === 'string' && value.at, `claims L${line}: at invalid`)
  })
  const ids = new Set()
  for (const claim of claims) {
    requireControl(!ids.has(claim.id), `claims L${claim.line}: duplicate id ${claim.id}`)
    ids.add(claim.id)
  }
  return claims
}

export const connectControl = records => {
  requireControl(records.length > 0, 'empty JSONL')
  const byId = new Map()
  const children = new Map()
  for (const record of records) {
    requireControl(!byId.has(record.id), `L${record.line}: duplicate id ${record.id}`)
    byId.set(record.id, record)
    children.set(record.id, [])
  }
  const roots = []
  for (const record of records) {
    if (record.rel === null) roots.push(record)
    else {
      requireControl(record.rel.parent !== record.id, `L${record.line}: self parent ${record.id}`)
      const parent = byId.get(record.rel.parent)
      requireControl(parent, `L${record.line}: missing parent ${record.rel.parent}`)
      requireControl(record.state !== 'active' || parent.state === 'active', `L${record.line}: active parent required`)
      children.get(record.rel.parent).push(record)
    }
  }
  for (const record of records) requireControl(record.state !== 'active' || record.rel?.kind !== 'details' || children.get(record.id).length === 0, `L${record.line}: active details must be leaf`)
  requireControl(roots.length === 1, `exactly one root required; found ${roots.length}`)
  const visiting = new Set()
  const visited = new Set()
  const visit = record => {
    requireControl(!visiting.has(record.id), `cycle at ${record.id}`)
    if (visited.has(record.id)) return
    visiting.add(record.id)
    children.get(record.id).forEach(visit)
    visiting.delete(record.id)
    visited.add(record.id)
  }
  visit(roots[0])
  requireControl(visited.size === records.length, 'orphan or detached cycle')
  const documents = records.filter(record => record.op === 'document' && record.state === 'active')
  requireControl(documents.length === 1, `exactly one active document required; found ${documents.length}`)
  requireControl(documents[0] === roots[0], 'active document must be root')
  requireControl(documents[0].schema === 3, 'root schema 3 required')
  return { root: roots[0], children }
}
