// Thin checklist view on SheetUI. Only its check date is authoritative for UI progress.
import {parseSheetJsonl, mountEditableSheet} from '../../editable-sheet/src/index.mjs';

export function checklistProgress(sheetJsonl, answersJsonl = '') {
  const {view, rows, answers} = parseSheetJsonl(sheetJsonl, answersJsonl);
  const dates = view.columns.filter(column => column.kind === 'checkdate' && column.scope === 'answer');
  if (dates.length !== 1) throw new Error('Checklist requires exactly one checkdate answer column');
  const key = dates[0].key;
  let completed = 0;
  for (const row of rows) {
    const date = answers.get(row.id)?.[key];
    if (date === undefined || date === '') continue;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
        !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
      throw new Error('Invalid check date for row ' + row.id);
    }
    completed++;
  }
  return {completed, total: rows.length};
}

export function mountChecklist(root, {sheetJsonl, answersJsonl = '', onChange, ...sheetOptions} = {}) {
  const {view} = parseSheetJsonl(sheetJsonl, answersJsonl);
  if (typeof view.labels.progress !== 'string' || !view.labels.progress.trim()) {
    throw new Error('Missing label: progress');
  }
  const initial = checklistProgress(sheetJsonl, answersJsonl);
  const output = document.createElement('output');
  output.setAttribute('aria-label', view.labels.progress);
  const host = document.createElement('div');
  root.replaceChildren(output, host);
  const display = counts => { output.textContent = [counts.completed, counts.total].join(' / '); };
  display(initial);
  return mountEditableSheet(host, {
    ...sheetOptions, sheetJsonl, answersJsonl,
    onChange: snapshot => {
      display(checklistProgress(snapshot.sheetJsonl, snapshot.answersJsonl));
      onChange?.(snapshot);
    },
  });
}
