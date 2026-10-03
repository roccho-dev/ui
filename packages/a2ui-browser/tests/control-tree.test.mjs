import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createControlCatalog } from '../src/catalog/control.mjs';

const design = JSON.parse(await readFile(new URL('../../../apps/control/design.json', import.meta.url), 'utf8'));
const component = design.messages[1].updateComponents.components[0];
const records = [
  { id: 'root', rel: null, op: 'document', schema: 3, state: 'active', title: 'Root' },
  { id: 'child', rel: { parent: 'root', kind: 'details' }, state: 'active', title: 'Child' },
];
const model = { control: records, claims: [], summary: { claims: 'not provided' } };

const document = { createElement(tagName) {
  const listeners = new Map();
  return {
    tagName: tagName.toUpperCase(), dataset: {}, children: [], attributes: {}, hidden: false,
    append(...children) { this.children.push(...children); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(name, listener) { listeners.set(name, listener); },
    click() { listeners.get('click')?.(); },
  };
} };
const descendants = node => [node, ...node.children.flatMap(descendants)];
const catalog = createControlCatalog({ id: design.catalogId });

test('opt-in editor offers focusable source actions and collapses details', () => {
  const tree = catalog.renderComponent({ component: catalog.validateComponent(component), dataModel: model, document });
  const nodes = descendants(tree);
  const property = nodes.find(node => node.dataset.editId === 'child' && node.dataset.editKey === 'title');
  assert.equal(property.tagName, 'BUTTON');
  assert.equal(property.attributes['aria-label'], 'edit title of child');
  assert.equal(nodes.find(node => node.dataset.editId === 'child' && node.dataset.editKey === 'rel').tagName, 'BUTTON');
  assert.equal(nodes.some(node => node.dataset.editKey === 'id'), false);
  assert.equal(nodes.find(node => node.dataset.controlAction === 'delete' && node.dataset.controlId === 'root').disabled, true);
  assert.equal(nodes.find(node => node.dataset.controlAction === 'delete' && node.dataset.controlId === 'child').disabled, false);
  const details = nodes.find(node => node.dataset.controlRelation === 'details');
  assert.equal(details.hidden, true);
  const toggle = nodes.find(node => node.dataset.controlToggle === 'details');
  assert.equal(toggle.attributes['aria-expanded'], 'false');
  toggle.click();
  assert.equal(details.hidden, false);
  assert.equal(toggle.attributes['aria-expanded'], 'true');
});

test('read-only preview default retains spans, no actions, open details', () => {
  const { editable, collapseDetails, ...readOnly } = component;
  assert.equal(editable, true);
  assert.equal(collapseDetails, true);
  const tree = catalog.renderComponent({ component: catalog.validateComponent(readOnly), dataModel: model, document });
  const nodes = descendants(tree);
  assert.equal(nodes.some(node => node.dataset.editId || node.dataset.controlAction), false);
  assert.equal(nodes.find(node => node.dataset.controlRelation === 'details').hidden, false);
  assert.equal(nodes.find(node => node.dataset.key === 'title').tagName, 'SPAN');
});
