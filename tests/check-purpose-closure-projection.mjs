import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(repoRoot, 'tests/fixtures/purpose-closure');
const validPath = path.join(fixtureRoot, 'one-loop.valid.jsonl');
const invalidRoot = path.join(fixtureRoot, 'invalid');

const requiredByType = {
  purpose_node: ['id', 'title'],
  route_edge: ['id', 'from', 'to', 'relation'],
  finding_node: ['id', 'summary'],
  gap_node: ['id', 'purpose_id', 'ideal', 'current', 'delta', 'owner_role', 'proof_required'],
  subgap_node: ['id', 'parent_gap_id', 'delta'],
  task_node: ['id', 'primary_gap_id', 'summary'],
  work_order: ['id', 'primary_gap_id', 'scope', 'non_scope', 'closure_criteria'],
  dependency_edge: ['id', 'from', 'to', 'relation'],
  receipt_node: ['id', 'work_order_id', 'status', 'residual_handling'],
  residual_gap: ['id', 'source_receipt_id', 'purpose_id', 'delta'],
};
const rowTypes = Object.keys(requiredByType);
const receiptStatuses = new Set(['closed', 'reduced', 'residual']);

function readJsonl(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      const row = JSON.parse(line);
      row.__line = index + 1;
      return row;
    } catch (error) {
      throw new Error(`${rel(file)}:${index + 1}: invalid JSON: ${error.message}`);
    }
  });
}
function rel(file) {
  return path.relative(repoRoot, file).split(path.sep).join('/');
}
function fail(row, message) {
  throw new Error(`${row.__file || 'projection'}:${row.__line || '?'} ${row.type || '<missing-type>'}: ${message}`);
}
function assertObject(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('projection row must be an object');
}
function requireFields(row, fields) {
  for (const field of fields) {
    if (row[field] === undefined || row[field] === null || row[field] === '') fail(row, `missing required field ${field}`);
  }
}
function ensureArray(row, field) {
  if (!Array.isArray(row[field]) || row[field].length === 0) fail(row, `${field} must be a non-empty array`);
}
function validateProjection(rows, file) {
  const ids = new Map();
  const byType = new Map(rowTypes.map((type) => [type, []]));
  for (const row of rows) {
    row.__file = rel(file);
    assertObject(row);
    if (!rowTypes.includes(row.type)) fail(row, 'unknown row type');
    requireFields(row, requiredByType[row.type]);
    if (row.authoritative !== false) fail(row, 'projection rows must be non-authoritative');
    if (row.source?.kind !== 'projection') fail(row, 'source.kind must be projection');
    if (ids.has(row.id)) fail(row, `duplicate id ${row.id}`);
    ids.set(row.id, row);
    byType.get(row.type).push(row);
  }
  for (const type of rowTypes) {
    assert.ok(byType.get(type).length > 0, `${rel(file)} must contain ${type}`);
  }
  for (const row of byType.get('gap_node')) {
    if (ids.get(row.purpose_id)?.type !== 'purpose_node') fail(row, 'purpose_id must reference a purpose_node');
  }
  for (const row of byType.get('subgap_node')) {
    if (!['gap_node', 'subgap_node'].includes(ids.get(row.parent_gap_id)?.type)) fail(row, 'parent_gap_id must reference a gap_node or subgap_node');
  }
  for (const row of byType.get('task_node')) {
    if (ids.get(row.primary_gap_id)?.type !== 'gap_node') fail(row, 'primary_gap_id must reference a gap_node');
  }
  for (const row of byType.get('work_order')) {
    if (ids.get(row.primary_gap_id)?.type !== 'gap_node') fail(row, 'primary_gap_id must reference a gap_node');
    ensureArray(row, 'scope');
    ensureArray(row, 'non_scope');
    ensureArray(row, 'closure_criteria');
  }
  for (const row of [...byType.get('route_edge'), ...byType.get('dependency_edge')]) {
    if (!ids.has(row.from)) fail(row, `from reference ${row.from} does not exist`);
    if (!ids.has(row.to)) fail(row, `to reference ${row.to} does not exist`);
  }
  for (const row of byType.get('finding_node')) {
    const promotable = Boolean(row.owner_role || row.proof_required || row.route_id);
    if (!promotable && row.type !== 'finding_node') fail(row, 'ownerless/proofless/routeless finding must stay finding');
    if (!promotable && (row.gap_id || row.primary_gap_id || row.work_order_id)) fail(row, 'finding without owner, proof, and route must not bind to gap or work order');
  }
  const seenReceiptStatuses = new Set();
  for (const row of byType.get('receipt_node')) {
    if (ids.get(row.work_order_id)?.type !== 'work_order') fail(row, 'work_order_id must reference a work_order');
    if (!receiptStatuses.has(row.status)) fail(row, 'receipt status must be closed, reduced, or residual');
    seenReceiptStatuses.add(row.status);
    if (!row.residual_handling?.kind) fail(row, 'receipt must declare residual_handling.kind');
    if (row.status === 'closed' && row.residual_handling.kind !== 'none') fail(row, 'closed receipt residual_handling.kind must be none');
    if (row.status !== 'closed' && !row.residual_gap_id) fail(row, 'reduced or residual receipt must point to residual_gap_id');
  }
  for (const status of receiptStatuses) {
    if (!seenReceiptStatuses.has(status)) throw new Error(`${rel(file)} must separate receipt status ${status}`);
  }
  for (const row of byType.get('residual_gap')) {
    if (ids.get(row.source_receipt_id)?.type !== 'receipt_node') fail(row, 'source_receipt_id must reference a receipt_node');
    if (ids.get(row.purpose_id)?.type !== 'purpose_node') fail(row, 'purpose_id must reference a purpose_node');
    if (row.returned_as_next_input !== true) fail(row, 'residual_gap must be returned_as_next_input');
  }
  return {rows: rows.length, rowTypes: Object.fromEntries(rowTypes.map((type) => [type, byType.get(type).length]))};
}

const validReceipt = validateProjection(readJsonl(validPath), validPath);

const invalidFiles = fs.readdirSync(invalidRoot).filter((name) => name.endsWith('.jsonl')).sort();
assert.ok(invalidFiles.length >= 3, 'invalid fixtures must cover multiple failure classes');
for (const name of invalidFiles) {
  const file = path.join(invalidRoot, name);
  assert.throws(() => validateProjection(readJsonl(file), file), Error, `${name} must fail the closure projection gate`);
}

console.log(JSON.stringify({status: 'purpose-closure-projection-pass', valid: validReceipt, invalidFixtures: invalidFiles}, null, 2));
