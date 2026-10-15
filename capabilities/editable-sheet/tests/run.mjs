import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSheetJsonl, sheetSnapshot} from '../src/index.mjs';
import {createPortableHtml} from '../src/portable.mjs';

const here = new URL('../../../examples/editable-sheet/input/', import.meta.url);
const sheetJsonl = readFileSync(new URL('sheet.jsonl', here), 'utf8');
const answersJsonl = readFileSync(new URL('answers.jsonl', here), 'utf8');
const state = parseSheetJsonl(sheetJsonl, answersJsonl);
assert.equal(state.rows.length, 2);
assert.equal(state.answers.get('T01').comment, '架空の記録');
assert.equal(state.view.columns.length, 4);
const snap = sheetSnapshot(state);
assert.deepEqual(parseSheetJsonl(snap.sheetJsonl, snap.answersJsonl).rows, state.rows);
assert.deepEqual([...parseSheetJsonl(snap.sheetJsonl, snap.answersJsonl).answers], [...state.answers]);

const inline = createPortableHtml({sheetJsonl, answersJsonl});
assert.match(inline, /<main id="app"><\/main>/u);
assert.match(inline, /type="module"/u);
assert.ok(inline.includes(readFileSync(new URL('../src/index.mjs', import.meta.url), 'utf8')),
  'Portable HTML must reuse exact library renderer source');
assert.doesNotMatch(inline, /<script[^>]*\bsrc=|<link[^>]*\bhref=/u);

const reject = (sheet, answers, pattern) => assert.throws(() => parseSheetJsonl(sheet, answers), pattern);
reject('{bad\n', '', /Invalid JSONL/u);
reject('', '', /Invalid sheet view/u);
reject(sheetJsonl + sheetJsonl.split('\n')[1] + '\n', answersJsonl, /duplicate sheet row ID/u);
reject(sheetJsonl, '{"id":"T01"}\n{"id":"T01"}\n', /duplicate or orphan answer ID/u);
reject(sheetJsonl, '{"id":"missing"}\n', /duplicate or orphan answer ID/u);
const records = sheetJsonl.trim().split('\n').map(JSON.parse);
const replaceView = view => [JSON.stringify(view), ...records.slice(1).map(JSON.stringify)].join('\n') + '\n';
reject(replaceView({...records[0], columns: [...records[0].columns, records[0].columns[0]]}), answersJsonl, /Invalid sheet column/u);
reject(replaceView({...records[0], columns: [{key:'__proto__',label:'x',kind:'text'}]}), answersJsonl, /Invalid sheet column/u);
reject(replaceView({...records[0], columns: [{key:'name',label:'x',kind:'checkdate'}]}), answersJsonl, /Invalid sheet column/u);
reject(replaceView({...records[0], labels: {}}), answersJsonl, /Missing label/u);

const attack = '</script><img src=x onerror=alert(1)>';
const dangerousSheet = replaceView({...records[0], title: attack});
const dangerousAnswer = JSON.stringify({id:'T01',comment:attack}) + '\n';
const safeHtml = createPortableHtml({sheetJsonl: dangerousSheet, answersJsonl: dangerousAnswer});
assert.equal(safeHtml.includes(attack), false, 'HTML must not expose unescaped injected markup');
assert.equal(safeHtml.includes('\\u003c/script>'), true);
assert.equal((safeHtml.match(/<script\b/gu)||[]).length, 3);
assert.equal((safeHtml.match(/<\/script>/gu)||[]).length, 3);
assert.throws(() => createPortableHtml({sheetJsonl, answersJsonl:'{"id":"wrong"}\n'}), /orphan/u);
console.log('editable-sheet-contract: PASS');
