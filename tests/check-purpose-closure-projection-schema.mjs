const VALID_SOURCE = {
  purposes: [{id: 'purpose.sellable-company', label: 'High value sellable company'}],
  routes: [{from: 'purpose.sellable-company', to: 'gap.real-fixture-proof'}],
  findings: [{id: 'finding.proof-too-thin', text: 'artifact proof is too thin'}],
  gaps: [{id: 'gap.real-fixture-proof', finding_id: 'finding.proof-too-thin', ideal: 'real fixture proof', current: 'document-only proof', delta: 'implementation missing', owner_role: 'adapter-ci', proof_requirement: 'fixture digest and negative controls'}],
  subgaps: [{id: 'subgap.preview-html', parent_gap_id: 'gap.real-fixture-proof', text: 'preview must be useful HTML'}],
  tasks: [{id: 'task.read-surface-fixture', gap_id: 'gap.real-fixture-proof', text: 'read Purpose Atlas SDUI fixture'}],
  work_orders: [{id: 'wo.real-fixture-proof', primary_gap_id: 'gap.real-fixture-proof', scope: ['read fixture', 'write proof'], non_scope: ['runtime polling'], route: 'purpose.sellable-company->gap.real-fixture-proof', dependencies: ['tests/fixtures/purpose-atlas/surface.v0.9.jsonl'], closure_criteria: ['source digest present', 'negative controls fail when broken']}],
  receipts: [{id: 'receipt.real-fixture-proof', work_order_id: 'wo.real-fixture-proof', status: 'reduced', closed: ['source digest present'], reduced: ['preview HTML generated'], residuals: ['closure proof freshness'], residual_handling: 'carry into next work order'}],
  residuals: [{id: 'residual.closure-proof-freshness', receipt_id: 'receipt.real-fixture-proof', next_input: 'purpose adapter closure proof'}],
};

const REQUIRED_KINDS = new Set([
  'purpose_node',
  'route_edge',
  'finding_node',
  'gap_node',
  'subgap_node',
  'task_node',
  'work_order',
  'dependency_edge',
  'receipt_node',
  'residual_gap',
]);

const rows = projectPurposeClosure(VALID_SOURCE);
validatePurposeClosureProjection(rows);

mustReject('work order requires primary_gap_id', () =>
  validatePurposeClosureProjection(rows.map((row) => row.kind === 'work_order' ? omit(row, 'primary_gap_id') : row)),
);
mustReject('receipt must separate closed reduced residuals', () =>
  validatePurposeClosureProjection(rows.map((row) => row.kind === 'receipt_node' ? omit(row, 'residuals') : row)),
);
mustReject('projection rows are non-authoritative', () =>
  validatePurposeClosureProjection(rows.map((row) => row.id === 'gap.real-fixture-proof' ? {...row, authoritative: true} : row)),
);
mustReject('gap requires proof and owner fields', () =>
  validatePurposeClosureProjection(rows.map((row) => row.id === 'gap.real-fixture-proof' ? omit(row, 'owner_role') : row)),
);

const finding = rows.find((row) => row.kind === 'finding_node' && row.id === 'finding.proof-too-thin');
assert(finding, 'finding row exists');
assert(!('owner_role' in finding), 'finding without owner stays finding');
assert(!('proof_requirement' in finding), 'finding without proof stays finding');
assert(!('route_id' in finding), 'finding without route stays finding');

console.log('purpose-closure-projection-schema-pass');

function projectPurposeClosure(source) {
  return [
    ...source.purposes.map((purpose) => row('purpose_node', purpose.id, {label: purpose.label})),
    ...source.routes.map((edge) => row('route_edge', edge.from + '->' + edge.to, {from: edge.from, to: edge.to})),
    ...source.findings.map((finding) => row('finding_node', finding.id, {text: finding.text})),
    ...source.gaps.map((gap) => row('gap_node', gap.id, gap)),
    ...source.subgaps.map((gap) => row('subgap_node', gap.id, gap)),
    ...source.tasks.map((task) => row('task_node', task.id, task)),
    ...source.work_orders.map((order) => row('work_order', order.id, order)),
    ...source.work_orders.flatMap((order) => (order.dependencies || []).map((dep) => row('dependency_edge', order.id + '->' + dep, {from: order.id, to: dep}))),
    ...source.receipts.map((receipt) => row('receipt_node', receipt.id, receipt)),
    ...source.residuals.map((residual) => row('residual_gap', residual.id, residual)),
  ];
}

function row(kind, id, fields) {
  return {kind, id, authoritative: false, projection_role: 'generated-purpose-closure-row', ...fields};
}

function validatePurposeClosureProjection(projectionRows) {
  assert(Array.isArray(projectionRows), 'projection must be rows');
  const seenKinds = new Set();
  for (const projectionRow of projectionRows) {
    assert(REQUIRED_KINDS.has(projectionRow.kind), 'unknown projection row kind: ' + projectionRow.kind);
    assert(projectionRow.id, projectionRow.kind + ' requires id');
    assert(projectionRow.authoritative === false, projectionRow.id + ' must stay non-authoritative');
    assert(projectionRow.projection_role === 'generated-purpose-closure-row', projectionRow.id + ' must mark projection role');
    seenKinds.add(projectionRow.kind);
    if (projectionRow.kind === 'gap_node') validateGap(projectionRow);
    if (projectionRow.kind === 'work_order') validateWorkOrder(projectionRow);
    if (projectionRow.kind === 'receipt_node') validateReceipt(projectionRow);
    if (projectionRow.kind === 'residual_gap') validateResidual(projectionRow);
  }
  for (const kind of REQUIRED_KINDS) assert(seenKinds.has(kind), 'missing projection row kind: ' + kind);
}

function validateGap(projectionRow) {
  for (const key of ['ideal', 'current', 'delta', 'owner_role', 'proof_requirement']) {
    assert(Boolean(projectionRow[key]), 'gap requires ' + key + ': ' + projectionRow.id);
  }
}

function validateWorkOrder(projectionRow) {
  assert(Boolean(projectionRow.primary_gap_id), 'work order requires primary_gap_id: ' + projectionRow.id);
  assert(Array.isArray(projectionRow.scope), 'work order requires scope: ' + projectionRow.id);
  assert(Array.isArray(projectionRow.non_scope), 'work order requires non_scope: ' + projectionRow.id);
  assert(Boolean(projectionRow.route), 'work order requires route: ' + projectionRow.id);
  assert(Array.isArray(projectionRow.closure_criteria), 'work order requires closure criteria: ' + projectionRow.id);
}

function validateReceipt(projectionRow) {
  assert(['closed', 'reduced', 'residual'].includes(projectionRow.status), 'receipt status must be closed, reduced, or residual: ' + projectionRow.id);
  for (const key of ['closed', 'reduced', 'residuals']) {
    assert(Array.isArray(projectionRow[key]), 'receipt must separate ' + key + ': ' + projectionRow.id);
  }
  if (projectionRow.residuals.length > 0) assert(Boolean(projectionRow.residual_handling), 'receipt residuals require residual_handling: ' + projectionRow.id);
}

function validateResidual(projectionRow) {
  assert(Boolean(projectionRow.receipt_id), 'residual gap requires receipt_id: ' + projectionRow.id);
  assert(Boolean(projectionRow.next_input), 'residual gap requires next_input: ' + projectionRow.id);
}

function mustReject(name, fn) {
  try {
    fn();
  } catch (error) {
    assert(error.message, name + ' must fail with a clear message');
    return;
  }
  throw new Error(name + ' did not fail');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function omit(value, key) {
  const copy = {...value};
  delete copy[key];
  return copy;
}
