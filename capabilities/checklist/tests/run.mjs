import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseSheetJsonl} from '../../editable-sheet/src/index.mjs';
import {createPortableHtml} from '../../editable-sheet/src/portable.mjs';
import {checklistProgress} from '../src/index.mjs';

const fixture = new URL('../../../examples/editable-sheet/input/', import.meta.url);
const records = readFileSync(new URL('sheet.jsonl', fixture), 'utf8').trim().split('\n').map(JSON.parse);
const originalAnswers = readFileSync(new URL('answers.jsonl', fixture), 'utf8');
const definition = {...records[0], labels:{...records[0].labels, progress:'進捗'}};
const sheet = [definition, ...records.slice(1)].map(JSON.stringify).join('\n') + '\n';
const answerLine = values => values.map(JSON.stringify).join('\n') + '\n';
const date = '2026-10-15';
const once = answerLine([{id:'T01', checked_at:date, comment:'架空の記録'}]);
const both = answerLine([{id:'T01', checked_at:date}, {id:'T02', checked_at:date}]);
assert.deepEqual(checklistProgress(sheet, originalAnswers), {completed:0,total:2});
assert.deepEqual(checklistProgress(sheet, once), {completed:1,total:2});
assert.deepEqual(checklistProgress(sheet, both), {completed:2,total:2});
assert.deepEqual(checklistProgress(sheet, answerLine([{id:'T01',comment:'架空の記録'}])), {completed:0,total:2});
const withNewRow = sheet + '{"kind":"row","id":"T03","name":"架空の追加項目"}\n';
assert.deepEqual(checklistProgress(withNewRow, once), {completed:1,total:3});
assert.deepEqual(checklistProgress([definition, records[1]].map(JSON.stringify).join('\n') + '\n', once),
  {completed:1,total:1});
for (const invalid of ['true','done','2026-02-30','2026-10-15T01:00:00Z']) {
  assert.throws(() => checklistProgress(sheet, answerLine([{id:'T01',checked_at:invalid}])), /Invalid check date/u);
}
const noCheckdate = {...definition, columns:definition.columns.filter(column => column.kind !== 'checkdate')};
assert.throws(() => checklistProgress([noCheckdate,...records.slice(1)].map(JSON.stringify).join('\n') + '\n', ''),
  /exactly one checkdate/u);
const twoDates = {...definition, columns:[...definition.columns,{key:'approved_at',kind:'checkdate',scope:'answer',label:'承認日'}]};
assert.throws(() => checklistProgress([twoDates,...records.slice(1)].map(JSON.stringify).join('\n') + '\n', ''),
  /exactly one checkdate/u);
assert.deepEqual(parseSheetJsonl(sheet, once).rows, records.slice(1));
const portable = createPortableHtml({sheetJsonl:sheet, answersJsonl:once});
assert.ok(portable.includes('<main id="app"></main>'), 'Reuse SheetUI portable packaging');
assert.ok(portable.includes(readFileSync(new URL('../../editable-sheet/src/index.mjs', import.meta.url), 'utf8')),
  'No duplicate browser renderer in ChecklistUI');

if (process.env.CHROMIUM_EXECUTABLE) {
  const folder = mkdtempSync(join(tmpdir(), 'checklist-file-'));
  try {
    const sheetSource = readFileSync(new URL('../../editable-sheet/src/index.mjs', import.meta.url), 'utf8');
    const adapterSource = readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8');
    const clientSource = adapterSource.replace(/^import \{parseSheetJsonl, mountEditableSheet\} from '[^']+';\n/mu, '');
    assert.notEqual(clientSource, adapterSource, 'Only the import line is removed in this browser proof');
    const html = [
      '<!doctype html><html><meta charset="utf-8"><body><main id="app"></main><script type="module">',
      sheetSource, clientSource,
      'const app = document.getElementById("app");',
      'const sheetJsonl = ' + JSON.stringify(sheet) + ';',
      'mountChecklist(app, {sheetJsonl});',
      'const output = app.querySelector("output");',
      'const first = app.querySelector("button.checkdate");',
      'first.click();',
      'const one = output.textContent === "1 / 2";',
      'first.click();',
      'const cleared = output.textContent === "0 / 2";',
      'const add = Array.from(app.querySelectorAll("button")).find(x => x.textContent === "＋ 項目追加");',
      'add.click();',
      'const added = output.textContent === "0 / 3";',
      'window.confirm = () => true;',
      'const remove = Array.from(app.querySelectorAll("button")).find(x => x.getAttribute("aria-label") === "T03 削除");',
      'remove.click();',
      'document.body.dataset.proof = one && cleared && added && output.textContent === "0 / 2" ? "PASS" : "FAIL";',
      '</script></body></html>',
    ].join('\n');
    const location = join(folder, 'proof.html');
    writeFileSync(location, html, 'utf8');
    const chrome = spawnSync(process.env.CHROMIUM_EXECUTABLE, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--disable-extensions', '--disable-background-networking',
      '--user-data-dir=' + join(folder, 'profile'),
      '--virtual-time-budget=1500', '--dump-dom', pathToFileURL(location).href,
    ], {encoding:'utf8', timeout:25000, maxBuffer:5 * 1024 * 1024});
    assert.equal(chrome.status, 0, 'Checklist browser execution: ' + (chrome.stderr || chrome.error || '').slice(-800));
    assert.match(chrome.stdout, /<body[^>]*data-proof="PASS"/u,
      'SheetUI checkdate/add/delete must update ChecklistUI derived progress');
    console.log('checklist-file-navigation: PASS');
  } finally {
    rmSync(folder, {recursive:true, force:true});
  }
}
console.log('checklist-contract: PASS');
