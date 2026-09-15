import assert from 'node:assert/strict';
import { mountFeature } from '../../../packages/control/render.mjs';

let assertions = 0;
const equal = (...args) => { assert.equal(...args); assertions += 1; };
const match = (...args) => { assert.match(...args); assertions += 1; };
const ok = (...args) => { assert.ok(...args); assertions += 1; };

const createDocument = () => {
  const all = [];
  const document = {
    createElement(tag) {
      const listeners = new Map();
      const classes = new Set();
      const node = {
        tag,
        children: [],
        dataset: {},
        hidden: false,
        disabled: false,
        textContent: '',
        value: '',
        className: '',
        classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } },
        addEventListener(name, listener) { listeners.set(name, listener); },
        append(...values) { this.children.push(...values); },
        replaceChildren(...values) { this.children = [...values]; },
        setAttribute() {},
        showModal() { this.open = true; },
        focus() {},
        async click() { return listeners.get('click')?.({ currentTarget: this }); },
        close() { this.open = false; return listeners.get('close')?.(); },
      };
      all.push(node);
      return node;
    },
    all,
  };
  return document;
};

const find = (node, predicate) => {
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
};

const input = '{"id":"ui","op":"document","schema":3,"state":"active","rel":null,"title":"old"}\n';
const document = createDocument();
const root = document.createElement('root');
root.ownerDocument = document;
const writes = [];
const resource = { async put(candidate) { writes.push(candidate); } };
const mounted = await mountFeature({ input, resource, root, scope: { confirm: () => true } });
const title = find(root, node => node.dataset?.key === 'title');
ok(title);
await title.click();
const editor = find(root, node => node.id === 'record-editor');
const save = find(root, node => node.id === 'save');
const status = find(root, node => node.id === 'status');
ok(editor && save && status);
editor.value = '{"id":"ui","op":"document","schema":3,"state":"active","rel":null,"title":"new"}';
await save.click();
equal(writes.length, 1);
match(writes[0], /"title":"new"/);
match(mounted.read(), /"title":"new"/);
equal(status.textContent, 'saved');

const localDocument = createDocument();
const localRoot = localDocument.createElement('root');
localRoot.ownerDocument = localDocument;
const localMounted = await mountFeature({ input, root: localRoot, scope: { confirm: () => true } });
const localTitle = find(localRoot, node => node.dataset?.key === 'title');
ok(localTitle);
await localTitle.click();
const localEditor = find(localRoot, node => node.id === 'record-editor');
const localSave = find(localRoot, node => node.id === 'save');
const localStatus = find(localRoot, node => node.id === 'status');
ok(localEditor && localSave && localStatus);
localEditor.value = '{"id":"ui","op":"document","schema":3,"state":"active","rel":null,"title":"local"}';
await localSave.click();
equal(localStatus.textContent, 'edited');
match(localMounted.read(), /"title":"local"/);

console.log(JSON.stringify({ assertions, schema: 'ui.control-resource-proof/1', status: 'PASS' }));
