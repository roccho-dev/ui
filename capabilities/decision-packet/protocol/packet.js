import { canonicalClone, canonicalJson, SHA256_PATTERN, sha256 } from '../../semantic-map/protocol/index.js';

export const DECISION_PACKET_SCHEMA = 'decision-packet/1';
const ENTRY_FIELDS = Object.freeze(['id', 'label', 'summary', 'href', 'kind']);
const BODY_FIELDS = Object.freeze([
  'schema',
  'authority',
  'privacy_class',
  'decision_id',
  'checkpoint_id',
  'title',
  'question',
  'status',
  'recommendation',
  'rationale',
  'changed_since_previous',
  'alternatives',
  'evidence_for',
  'evidence_against',
  'conditions',
  'conflicts',
  'gaps',
  'next_action',
  'success_conditions',
  'outcomes',
  'record_refs',
  'projection_asset_refs',
  'query_contract_digest',
]);
const PACKET_FIELDS = Object.freeze([...BODY_FIELDS, 'packet_digest']);
const LIST_FIELDS = Object.freeze([
  'changed_since_previous',
  'alternatives',
  'evidence_for',
  'evidence_against',
  'conditions',
  'conflicts',
  'gaps',
  'success_conditions',
  'outcomes',
  'record_refs',
  'projection_asset_refs',
]);
const FORBIDDEN_SECRET = /(?:sk-[a-z0-9_-]{16,}|ghp_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/iu;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const HTML = /<\/?[a-z][^>]*>/iu;

function invariant(condition, message) {
  if (!condition) throw new Error(`decision-packet: ${message}`);
}

function plainObject(value, name) {
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  invariant(prototype === Object.prototype || prototype === null, `${name} must be a plain object`);
  return value;
}

function exactKeys(value, expected, name) {
  const allowed = new Set(expected);
  for (const key of expected) invariant(Object.hasOwn(value, key), `${name}.${key} is required`);
  for (const key of Object.keys(value)) invariant(allowed.has(key), `${name}.${key} is not allowed`);
}

function publicText(value, name, { max = 2_000, empty = false } = {}) {
  invariant(typeof value === 'string', `${name} must be a string`);
  invariant(empty || value.length > 0, `${name} must not be empty`);
  invariant(value.length <= max, `${name} is too long`);
  invariant(!/[\u0000-\u001f\u007f]/u.test(value), `${name} contains a control character`);
  invariant(!HTML.test(value), `${name} contains raw HTML`);
  invariant(!FORBIDDEN_SECRET.test(value), `${name} contains a secret-like value`);
  invariant(!EMAIL.test(value), `${name} contains an email-like value`);
  return value;
}

function publicId(value, name) {
  return publicText(value, name, { max: 240 });
}

function publicHref(value, name) {
  const href = publicText(value, name, { max: 8_192 });
  let parsed;
  try { parsed = new URL(href); } catch (_) { throw new Error(`decision-packet: ${name} must be an absolute URL`); }
  invariant(parsed.protocol === 'https:' || parsed.protocol === 'http:', `${name} must use http or https`);
  invariant(!parsed.username && !parsed.password, `${name} must not contain userinfo`);
  return href;
}

function normalizeEntry(input, name) {
  const value = plainObject(input, name);
  const required = ['id', 'label', 'summary'];
  const allowed = new Set(ENTRY_FIELDS);
  for (const key of required) invariant(Object.hasOwn(value, key), `${name}.${key} is required`);
  for (const key of Object.keys(value)) invariant(allowed.has(key), `${name}.${key} is not allowed`);
  const result = {
    id: publicId(value.id, `${name}.id`),
    label: publicText(value.label, `${name}.label`, { max: 160 }),
    summary: publicText(value.summary, `${name}.summary`, { max: 800, empty: true }),
  };
  if (Object.hasOwn(value, 'kind')) result.kind = publicText(value.kind, `${name}.kind`, { max: 80 });
  if (Object.hasOwn(value, 'href')) result.href = publicHref(value.href, `${name}.href`);
  return Object.freeze(result);
}

function normalizeEntries(input, name) {
  invariant(Array.isArray(input), `${name} must be an array`);
  invariant(input.length <= 16, `${name} exceeds 16 entries`);
  const entries = input.map((entry, index) => normalizeEntry(entry, `${name}[${index}]`));
  const ids = entries.map((entry) => entry.id);
  invariant(new Set(ids).size === ids.length, `${name} contains duplicate ids`);
  return Object.freeze(entries);
}

function normalizeBody(input) {
  const value = plainObject(input, 'Packet');
  exactKeys(value, BODY_FIELDS, 'Packet');
  invariant(value.schema === DECISION_PACKET_SCHEMA, `schema ${value.schema} is not ${DECISION_PACKET_SCHEMA}`);
  invariant(value.authority === false, 'authority must be false');
  invariant(value.privacy_class === 'public', 'privacy_class must be public');
  const result = {
    schema: DECISION_PACKET_SCHEMA,
    authority: false,
    privacy_class: 'public',
    decision_id: publicId(value.decision_id, 'Packet.decision_id'),
    checkpoint_id: publicId(value.checkpoint_id, 'Packet.checkpoint_id'),
    title: publicText(value.title, 'Packet.title', { max: 240 }),
    question: publicText(value.question, 'Packet.question'),
    status: publicText(value.status, 'Packet.status', { max: 80 }),
    recommendation: publicText(value.recommendation, 'Packet.recommendation'),
    rationale: publicText(value.rationale, 'Packet.rationale'),
    next_action: publicText(value.next_action, 'Packet.next_action'),
    query_contract_digest: publicText(value.query_contract_digest, 'Packet.query_contract_digest', { max: 71 }),
  };
  invariant(SHA256_PATTERN.test(result.query_contract_digest), 'query_contract_digest must be sha256');
  for (const field of LIST_FIELDS) result[field] = normalizeEntries(value[field], `Packet.${field}`);
  const totalEntries = LIST_FIELDS.reduce((sum, field) => sum + result[field].length, 0);
  invariant(totalEntries <= 80, 'Packet contains more than 80 list entries');
  return Object.freeze(result);
}

export async function decisionPacketDigest(input) {
  return sha256(canonicalJson(normalizeBody(input)));
}

export async function createDecisionPacket(input) {
  const body = normalizeBody(input);
  return Object.freeze({ ...body, packet_digest: await sha256(canonicalJson(body)) });
}

export async function inspectDecisionPacket(input) {
  const value = plainObject(input, 'Packet');
  exactKeys(value, PACKET_FIELDS, 'Packet');
  invariant(SHA256_PATTERN.test(value.packet_digest), 'packet_digest must be sha256');
  const bodyInput = {};
  for (const key of BODY_FIELDS) bodyInput[key] = value[key];
  const body = normalizeBody(bodyInput);
  const expected = await sha256(canonicalJson(body));
  invariant(value.packet_digest === expected, `packet_digest ${value.packet_digest} is not ${expected}`);
  return Object.freeze({ packet: Object.freeze({ ...body, packet_digest: expected }), body, packet_digest: expected });
}

export function decisionPacketJson(input) {
  return canonicalJson(canonicalClone(input));
}
