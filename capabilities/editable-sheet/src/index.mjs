// Non-authoritative JSONL editable sheet. Business data remains with callers.
const badKey = key => ['__proto__', 'prototype', 'constructor'].includes(key);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const lines = values => values.map(value => JSON.stringify(value)).join('\n') + (values.length ? '\n' : '');
const readLines = input => String(input ?? '').split(/\r?\n/u).flatMap((raw, line) => {
  if (!raw.trim()) return [];
  try { return [JSON.parse(raw)]; }
  catch { throw new Error('Invalid JSONL at line ' + (line + 1)); }
});
const node = (tag, value = '') => {
  const result = document.createElement(tag);
  result.textContent = String(value);
  return result;
};

export function parseSheetJsonl(sheetJsonl, answersJsonl = '') {
  const [view, ...rows] = readLines(sheetJsonl);
  if (!object(view) || view.kind !== 'view' || !Array.isArray(view.columns) || !view.columns.length ||
      !object(view.labels) || typeof view.title !== 'string' || typeof view.idPrefix !== 'string' ||
      !view.idPrefix || (view.nextId !== undefined && (!Number.isInteger(view.nextId) || view.nextId < 1)) ||
      (view.idDigits !== undefined && (!Number.isInteger(view.idDigits) || view.idDigits < 1 || view.idDigits > 12))) {
    throw new Error('Invalid sheet view');
  }
  for (const label of ['save', 'exportRows', 'exportAnswers', 'add', 'delete', 'unchecked', 'confirmDelete']) {
    if (typeof view.labels[label] !== 'string') throw new Error('Missing label: ' + label);
  }
  const seenKeys = new Set();
  const kinds = new Set(['text', 'textarea', 'checkdate']);
  for (const column of view.columns) {
    if (!object(column) || typeof column.key !== 'string' || !/^[a-zA-Z][\w-]*$/u.test(column.key) ||
        badKey(column.key) || ['id', 'kind'].includes(column.key) || seenKeys.has(column.key) ||
        typeof column.label !== 'string' || !kinds.has(column.kind) ||
        ![undefined, 'answer'].includes(column.scope) ||
        (column.kind === 'checkdate' && column.scope !== 'answer') ||
        (column.meta !== undefined && (!Array.isArray(column.meta) ||
          column.meta.some(key => typeof key !== 'string' || badKey(key))))) {
      throw new Error('Invalid sheet column');
    }
    seenKeys.add(column.key);
  }
  const answerKeys = new Set(view.columns.filter(column => column.scope === 'answer').map(column => column.key));
  const ids = new Set();
  for (const row of rows) {
    if (!object(row) || row.kind !== 'row' || typeof row.id !== 'string' || !row.id || ids.has(row.id)) {
      throw new Error('Invalid or duplicate sheet row ID');
    }
    if ([...answerKeys].some(key => Object.hasOwn(row, key))) {
      throw new Error('Answer field in sheet row');
    }
    ids.add(row.id);
  }
  const answers = new Map();
  for (const answer of readLines(answersJsonl)) {
    if (!object(answer) || typeof answer.id !== 'string' || !ids.has(answer.id) || answers.has(answer.id)) {
      throw new Error('Invalid, duplicate or orphan answer ID');
    }
    if (Object.keys(answer).some(key => key !== 'id' && !answerKeys.has(key))) {
      throw new Error('Non-answer field in answer record');
    }
    answers.set(answer.id, answer);
  }
  return {view, rows, answers};
}

export function sheetSnapshot(state) {
  return {
    sheetJsonl: lines([state.view, ...state.rows]),
    answersJsonl: lines(state.rows.map(row => state.answers.get(row.id)).filter(Boolean)),
    filename: state.view.filename,
  };
}

export function mountEditableSheet(root, {sheetJsonl, answersJsonl = '', onSave, onExport, onChange} = {}) {
  const state = parseSheetJsonl(sheetJsonl, answersJsonl);
  const {view, rows, answers} = state;
  const notify = () => onChange?.(sheetSnapshot(state));
  // Assign the next ID before deletion, so removed IDs are not reused.
  if (!Number.isInteger(view.nextId)) {
    view.nextId = Math.max(0, ...rows.filter(row => row.id.startsWith(view.idPrefix))
      .map(row => Number(row.id.slice(view.idPrefix.length)) || 0)) + 1;
  }
  const el = (tag, label = '', className) => {
    const result = node(tag, label);
    if (className) result.className = className;
    return result;
  };
  const writeAnswer = (id, key, value) => {
    const record = answers.get(id) || {id};
    if (value) record[key] = value;
    else delete record[key];
    if (Object.keys(record).length === 1) answers.delete(id);
    else answers.set(id, record);
  };
  const localDate = () => {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')].join('-');
  };

  const header = el('header');
  const intro = el('div');
  intro.append(el('h1', view.title));
  if (view.description) intro.append(el('p', view.description));
  const actions = el('div', '', 'actions');
  if (onSave) {
    const button = el('button', view.labels.save);
    button.addEventListener('click', () => onSave(sheetSnapshot(state)));
    actions.append(button);
  }
  if (onExport) {
    for (const [labelKey, fileKind] of [['exportRows', 'sheet'], ['exportAnswers', 'answers']]) {
      const button = el('button', view.labels[labelKey]);
      button.addEventListener('click', () => onExport(fileKind, sheetSnapshot(state)));
      actions.append(button);
    }
  }
  header.append(intro, actions);
  const overflow = el('div', '', 'overflow');
  const table = el('table');
  const heading = el('tr');
  for (const column of view.columns) heading.append(el('th', column.label));
  heading.append(el('th'));
  const head = el('thead');
  head.append(heading);
  const body = el('tbody');
  table.append(head, body);
  overflow.append(table);
  const add = el('button', view.labels.add);
  if (view.note) root.replaceChildren(header, overflow, add, el('p', view.note));
  else root.replaceChildren(header, overflow, add);

  function render() {
    body.replaceChildren();
    for (const row of rows) {
      const tr = el('tr');
      for (const column of view.columns) {
        const cell = el('td');
        if (column.meta) {
          const parts = column.meta.map(key => row[key]).filter(Boolean);
          if (parts.length) cell.append(el('small', parts.join(' · ')));
        }
        if (column.kind === 'checkdate') {
          const button = el('button', '', 'checkdate');
          const update = () => {
            const value = answers.get(row.id)?.[column.key];
            button.textContent = value || view.labels.unchecked;
            button.setAttribute('aria-pressed', String(Boolean(value)));
          };
          button.setAttribute('aria-label', row.id + ' ' + column.label);
          button.addEventListener('click', () => {
            writeAnswer(row.id, column.key,
              answers.get(row.id)?.[column.key] ? '' : localDate());
            update();
            notify();
          });
          update();
          cell.append(button);
        } else {
          const edit = el(column.kind === 'textarea' ? 'textarea' : 'input');
          if (edit.tagName === 'INPUT') edit.type = 'text';
          edit.value = String((column.scope === 'answer' ? answers.get(row.id) : row)?.[column.key] ?? '');
          edit.setAttribute('aria-label', row.id + ' ' + column.label);
          edit.addEventListener('input', () => {
            if (column.scope === 'answer') writeAnswer(row.id, column.key, edit.value);
            else row[column.key] = edit.value;
            notify();
          });
          cell.append(edit);
        }
        tr.append(cell);
      }
      const command = el('td');
      const remove = el('button', view.labels.delete);
      remove.setAttribute('aria-label', row.id + ' ' + view.labels.delete);
      remove.addEventListener('click', () => {
        const displayKey = view.columns.find(column => column.scope !== 'answer')?.key;
        const message = view.labels.confirmDelete.replace(/\{(\w+)\}/gu,
          (_, key) => String(row[key] ?? (key === 'name' ? row[displayKey] : '')));
        if (!confirm(message)) return;
        rows.splice(rows.indexOf(row), 1);
        answers.delete(row.id);
        render();
        notify();
      });
      command.append(remove);
      tr.append(command);
      body.append(tr);
    }
  }
  add.addEventListener('click', () => {
    const prefix = view.idPrefix;
    const digits = view.idDigits ?? 2;
    let id;
    do { id = prefix + String(view.nextId++).padStart(digits, '0'); }
    while (rows.some(row => row.id === id));
    const newRow = {kind: 'row', id};
    for (const column of view.columns) if (column.scope !== 'answer') newRow[column.key] = '';
    rows.push(newRow);
    render();
    body.lastElementChild.querySelector('input,textarea')?.focus();
    notify();
  });
  render();
  return {snapshot: () => sheetSnapshot(state)};
}
