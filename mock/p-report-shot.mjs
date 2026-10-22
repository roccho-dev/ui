// Mock (adrs#647 W c6346263403, R c6346274848): the nine contents of P's
// reports (c6340826086) laid on the present /hq/ World, drawn by the present
// ui. Synthetic data only. What the present ui cannot draw where v2 places it
// is drawn as a supplied box, or a changes line, marked 【要実装 …】.
// Run inside the semantic-map-browser-proof Nix shell, from the ui root:
//   node mock/p-report-shot.mjs --out=<fresh absent directory> [--fonts=<fonts.conf with a CJK font>]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildLiveAtlas } from '../scripts/build-live-atlas.mjs';
import { gapWorld } from '../tests/fixtures/atlas-gap-world.mjs';

const out = process.argv.find(item => item.startsWith('--out='))?.slice(6);
if (!out) throw new Error('--out is required');
fs.mkdirSync(out);
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_DRIVER_ROOT);

const ref = (kind, id) => ({ space: 'fixture:gap', kind, id });
const box = (kind, id, label, area, order, flags = [], activity = 'none') => ({ ref: ref(kind, id), label, area, order, visible: true, activity, flags });
const contains = (frameId, from, to) => ({ ref: ref('scope-contains', frameId + ':' + from.id + ':' + to.id), from, to, kind: 'contains', path: false, containment: 'from-contains-to' });

// Not `physical`: with physical Scopes, gapView keeps only those and the
// history in the Scope area (atlas-gap.mjs:659-663), and the series' cards
// would not be drawn.
const world = gapWorld({ through: 't4', judged: true, groups: true, current: true });
const present = world.frames.at(-1);
// The current fixture agents are replaced by the series' roles (1).
present.entities = present.entities.filter(entity => entity.area !== 'agents');
const add = (...items) => present.entities.push(...items);
// 1 系列の状態：系列の norm のカード（Scope）。MMD の今のノードと主な PR。
const series = [
  box('series', 'atlas', 'atlas（adrs#647）\nMMD：D4 → HQ の deploy\nui#386 merged · CI ✓', 'scopes', 400, ['scope_status=unmet']),
  box('series', 'sys1', 'sys1\n【要実装 ui：✋ は flag awaiting=user-decision】\nUser の判断待ち（P の記録）：H のやり直し', 'scopes', 401, ['awaiting=user-evaluation']),
  box('series', 'codex', 'codex\n能力の表 capability-v1', 'scopes', 402, ['scope_status=unknown']),
];
add(...series);
// 8 能力の表（codex）：能力ごとの子のカード。記号は D5 の意味、違いは語。
const capabilities = [
  ['exec', '確認済み', 'scope_status=declared_satisfied'], ['app-server', 'tool のみ', 'scope_status=unknown'],
  ['mcp', '未試験', 'scope_status=unknown'], ['sandbox', '環境で阻まれた', 'scope_status=unmet'], ['resume', 'UNKNOWN', 'scope_status=unknown'],
].map(([id, state, flag], index) => box('capability', id, '能力 ' + id + '\n' + state, 'scopes', 410 + index, [flag]));
add(...capabilities);
present.relations.push(...capabilities.map(item => contains(present.id, series[2].ref, item.ref)));
// 1 Agents：R・W・P（▶ 稼働、• 直近、? 不明。session の観測）。
add(box('agent', 'atlas.R', 'atlas.R\nsession running', 'agents', 0, [], 'now'), box('agent', 'atlas.W', 'atlas.W\ntranscript-only', 'agents', 1, [], 'recent'),
  box('agent', 'sys1.W', 'sys1.W\nsession 不明', 'agents', 2, [], 'unknown'), box('agent', 'P', 'P\nsession running', 'agents', 3, [], 'now'));
// 2 目的↔理想の箱の行（User の判断待ち）と、4〜7 現在状態の箱の行：今の ui は
// その箱に行を足せず、目的エリアに供給の箱も描かない（atlas-gap.mjs:725-726
// は目的エリアの供給を残さない）。だから Scope エリアに、本来の置き場所を書いて出す。
add(box('mock-line', 'adequacy-lines', '【要実装 ui：本来は目的エリアの「目的↔理想の差」の箱の行】\nUser の判断待ち：試験の値と凡例（atlas・16:20Z から・P の記録）\nUser の判断待ち：H のやり直し（sys1・10-21 から・P の記録）', 'scopes', 380),
  box('mock-line', 'current-lines', '【要実装 ui：本来は目的エリアの「現在状態」の箱の行】\nHQ ループ 応答 · 最後 16:39Z · reap 0\ntunnel 応答 · 張り直し 1（14:02Z）\nrun 不明 · 最後 16:38Z\nloop の停止 今日 3（不要 2）\nJev 残り 12/200 · TypeLLM 残り 不明 · C2 tool 31 回・48k tokens', 'scopes', 381));
// 9 完了と打ち切り：今の完成の印と閉じた差（履歴）。
const file = path.join(out, 'p-report-world.json');
fs.writeFileSync(file, JSON.stringify(world, null, 1));
await buildLiveAtlas({ input: file, out: path.join(out, 'site'), consumer: 'app', updateIntervalMinutes: 10 });
const body = fs.readFileSync(path.join(out, 'site', 'index.html'));
const site = http.createServer((request, response) => { response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(body); });
await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
// `--fonts=<fonts.conf>` adds a CJK font where the proof shell has none (CI installs one).
const fonts = process.argv.find(item => item.startsWith('--fonts='))?.slice(8);
const browser = await chromium.launch({ headless: true, ...(fonts ? { env: { ...process.env, FONTCONFIG_FILE: fonts } } : {}) });
try {
  // Tall enough that the whole World is in one image (the ui never shrinks
  // boxes below scale 1; a shorter window pans instead).
  const page = await browser.newPage({ viewport: { width: 1500, height: 2000 } });
  await page.goto('http://127.0.0.1:' + site.address().port + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.liveAtlasReady === 'true', null, { timeout: 60000 });
  // 2・3・4・5・9 変化の欄の行（新しい記録の種類と印）：今の ui は描けない。
  await page.evaluate(() => {
    const panel = document.getElementById('atlas-world-change');
    for (const text of ['【要実装 ui・apps】✋ User の判断待ち · atlas · 試験の値と凡例 · 16:20Z · P の記録 hq:p-records.jsonl',
      '【要実装 ui・apps】◆ User の判断 · atlas · 「atlas go ahead」→ C5 段 1 を採る · P の記録',
      '【要実装 ui・apps】⏸ loop の停止 · sys1.W · USER（不要）· P が再開 · 今日 3 回目',
      '【要実装 ui・apps】▣ P の receipt · hq-refresh 1761d512… · PASS · 戻していない · HQ の log と照合済み',
      '【要実装 ui・apps】✎ P の撤回 · T08・T10 の「未閉と表示し続ければ」· P の記録']) {
      const line = document.createElement('div'); line.textContent = text; line.style.color = '#c92a2a'; panel.prepend(line);
    }
    panel.scrollTop = 0;
  });
  await page.evaluate(() => window.liveAtlas.fit());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: path.join(out, 'p-report-1500.png') });
} finally {
  await browser.close();
  site.close();
}
console.log(JSON.stringify({ status: 'shot', out }));
