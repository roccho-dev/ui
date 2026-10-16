import {readFileSync} from 'node:fs';
import {parseSheetJsonl} from './index.mjs';

const script = readFileSync(new URL('./index.mjs', import.meta.url), 'utf8');
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');
const safe = value => String(value).replace(/</gu, '\\u003c');

// Materialize exactly the same source renderer; generated HTML is not a source of truth.
export function createPortableHtml({sheetJsonl, answersJsonl = ''}) {
  parseSheetJsonl(sheetJsonl, answersJsonl);
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title></title><style>${css}</style></head>
<body><main id="app"></main>
<script id="sheet-data" type="application/x-ndjson">${safe(sheetJsonl)}</script>
<script id="answers-data" type="application/x-ndjson">${safe(answersJsonl)}</script>
<script type="module">${script}
const sheetElement = document.getElementById('sheet-data');
const answersElement = document.getElementById('answers-data');
const saveBlob = (name, bytes, mime) => {
  const url = URL.createObjectURL(new Blob([bytes], {type:mime}));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
const replaceData = (element, value) => { element.textContent = value.replace(/</gu, String.fromCharCode(92) + 'u003c'); };
const initial = parseSheetJsonl(sheetElement.textContent, answersElement.textContent);
document.title = initial.view.title;
mountEditableSheet(document.getElementById('app'), {
  sheetJsonl: sheetElement.textContent,
  answersJsonl: answersElement.textContent,
  onSave: snapshot => {
    const copy = document.documentElement.cloneNode(true);
    copy.querySelector('#app').replaceChildren();
    replaceData(copy.querySelector('#sheet-data'), snapshot.sheetJsonl);
    replaceData(copy.querySelector('#answers-data'), snapshot.answersJsonl);
    saveBlob(snapshot.filename || 'sheet.html', '<!doctype html>\\n' + copy.outerHTML, 'text/html;charset=utf-8');
  },
  onExport: (kind, snapshot) => saveBlob(kind + '.jsonl', kind === 'sheet' ? snapshot.sheetJsonl : snapshot.answersJsonl, 'application/x-ndjson;charset=utf-8'),
});
</script></body></html>`;
}
