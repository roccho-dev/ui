import { mountGraphEditor, normalizeDocument, stringifyDocument } from '@roccho/graph-editor'

const config = JSON.parse(document.querySelector('#policy-app-config').textContent)
if (typeof config.labels?.title !== 'string' || !config.labels.title.trim()) throw new Error('config.labels.title required')
document.title = config.labels.title
const readDocument = async () => {
  const response = await fetch(config.endpoints.document, { cache: 'no-store' })
  if (!response.ok) throw new Error(`${config.labels.documentName} returned ${response.status}`)
  const etag = response.headers.get('etag')
  if (!etag) throw new Error('ETag required')
  const body = await response.text()
  const documentValue = normalizeDocument(JSON.parse(body))
  if (stringifyDocument(documentValue) !== body) throw new Error('document is not canonical')
  return { document: documentValue, etag }
}
const save = async ({ document: value, etag }) => {
  const candidate = stringifyDocument(value)
  const response = await fetch(config.endpoints.document, { method: 'PUT', headers: { 'Content-Type': 'application/json; charset=utf-8', 'If-Match': etag }, body: candidate })
  const body = await response.text()
  if (!response.ok) {
    if (response.status === 412) throw new Error(config.labels.stale)
    throw new Error(`${response.status}: ${body.trim()}`)
  }
  const result = JSON.parse(body)
  const readback = await readDocument()
  if (result.etag !== readback.etag || stringifyDocument(readback.document) !== candidate) throw new Error('Save readback mismatch')
  return readback
}
mountGraphEditor(document.querySelector('#app'), { labels: config.labels.editor, load: readDocument, save })
