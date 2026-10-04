import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { renderMarkdownDocument } from '../capabilities/core-port/src/markdown-document-renderer.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = path.join(root, 'apps/document-cli/main.mjs');
const input = path.join(root, 'examples/document-cli/input/model.json');
const original = fs.readFileSync(input);
const model = JSON.parse(original);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-document-cli-'));
const cases = [];
const check = (name, fn) => { fn(); cases.push(name); };
const run = (args, cwd = scratch) => {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024,
    env: { ...process.env, PATH: '', DISPLAY: '', NODE_OPTIONS: '' },
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
};
const write = (name, value) => {
  const filename = path.join(scratch, name);
  fs.writeFileSync(filename, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
  return filename;
};
const success = args => {
  const result = run(args);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.ok(result.stdout.endsWith('\n'));
  return JSON.parse(result.stdout);
};
const failure = (args, status, code) => {
  const result = run(args);
  assert.equal(result.status, status, result.stderr);
  assert.equal(result.stdout, '');
  assert.ok(result.stderr.startsWith(`document-cli: ${code}\n`), result.stderr);
  assert.ok(!result.stderr.includes(scratch));
  assert.ok(!result.stderr.includes('PRIVATE-SENTINEL'));
};

try {
  check('library-result-parity', () => {
    assert.deepEqual(success([input]), renderMarkdownDocument({ model }));
  });
  check('independent-japanese-body', () => {
    assert.equal(success([input]).markdown,
      '# 配備の確認（例）\n\nこれは表示用の例です。実際の配備・合意を示しません。\n\n' +
      '| ID | 確認 | 状態 |\n| --- | --- | --- |\n' +
      '| check-1 | 前提を確認する | 未実施 |\n| check-2 | 結果を読み返す | 未実施 |\n');
  });
  check('provenance-and-no-authority', () => {
    const value = success([input]);
    assert.equal(value.provenance.generatedArtifactsAreAuthority, false);
    assert.equal(value.provenance.markdownDigest, createHash('sha256').update(value.markdown).digest('hex'));
    assert.equal(value.kind, 'ui.markdown-render.result.v1');
  });
  check('same-input-same-bytes', () => assert.equal(run([input]).stdout, run([input]).stdout));
  check('stdout-file-readback', () => {
    const value = run([input]);
    assert.equal(value.status, 0);
    const saved = write('result.json', value.stdout);
    assert.deepEqual(JSON.parse(fs.readFileSync(saved, 'utf8')), renderMarkdownDocument({ model }));
  });
  check('caller-cwd-without-browser-on-path', () => {
    const local = write('input.json', model);
    assert.deepEqual(success([path.basename(local)]), success([input]));
  });
  check('optional-template', () => {
    const template = JSON.stringify({ kind: 'md.template.block.v1', slot: 'after', block: { kind: 'paragraph', text: '補足（例）' } }) + '\n';
    const file = write('template.jsonl', template);
    assert.deepEqual(success([input, file]), renderMarkdownDocument({ model, template }));
    assert.ok(success([input, file]).markdown.endsWith('補足（例）\n'));
  });
  check('warning-is-not-discarded', () => {
    const value = structuredClone(model);
    value.blocks.push({ kind: 'future-document-block' });
    const result = success([write('warning.json', value)]);
    assert.deepEqual(result, renderMarkdownDocument({ model: value }));
    assert.ok(result.diagnostics.some(item => item.code === 'unknown_block'));
    assert.ok(result.markdown.includes('[unsupported block: future-document-block]'));
  });
  check('missing-arguments', () => failure([], 2, 'E_USAGE'));
  check('extra-arguments', () => failure([input, input, input], 2, 'E_USAGE'));
  check('unknown-option', () => failure(['--private-sentinel'], 2, 'E_USAGE'));
  check('remote-url', () => failure(['https://invalid.example/PRIVATE-SENTINEL'], 2, 'E_USAGE'));
  check('file-url-is-not-a-local-path', () => failure(['file:///PRIVATE-SENTINEL'], 2, 'E_USAGE'));
  check('missing-file', () => failure([path.join(scratch, 'PRIVATE-SENTINEL.json')], 1, 'E_INPUT'));
  check('malformed-json', () => failure([write('bad.json', '{PRIVATE-SENTINEL')], 1, 'E_INPUT'));
  check('invalid-utf8', () => failure([write('bad-utf8.json', Buffer.from([0xc3, 0x28]))], 1, 'E_INPUT'));
  check('invalid-kind', () => failure([write('kind.json', { kind: 'PRIVATE-SENTINEL', blocks: [] })], 1, 'E_RENDER'));
  check('missing-blocks', () => failure([write('blocks.json', { kind: 'document.model.v1' })], 1, 'E_RENDER'));
  check('forbidden-authority-does-not-escape-stdout', () => {
    failure([write('authority.json', { ...model, approval: 'PRIVATE-SENTINEL' })], 1, 'E_RENDER');
  });
  check('malformed-template', () => failure([input, write('bad-template.jsonl', '{PRIVATE-SENTINEL')], 1, 'E_RENDER'));
  check('help-without-input', () => {
    const result = run(['--help']);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.match(result.stdout, /^Usage: node .*model\.json/);
  });
  check('no-files-written-and-input-unchanged', () => {
    const before = fs.readdirSync(scratch).sort().map(name => [name, fs.readFileSync(path.join(scratch, name))]);
    success([input]);
    const after = fs.readdirSync(scratch).sort().map(name => [name, fs.readFileSync(path.join(scratch, name))]);
    assert.deepEqual(after, before);
    assert.deepEqual(fs.readFileSync(input), original);
  });
  check('bounded-local-import-closure', () => {
    const source = fs.readFileSync(cli, 'utf8');
    const imports = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(match => match[1]).sort();
    assert.deepEqual(imports, ['../../capabilities/core-port/src/markdown-document-renderer.mjs', 'node:fs/promises']);
    assert.doesNotMatch(source, /\bimport\s*\(/);
    assert.doesNotMatch(source, /\b(?:fetch|WebSocket|XMLHttpRequest)\s*\(/);
    const renderer = fs.readFileSync(path.join(root, 'capabilities/core-port/src/markdown-document-renderer.mjs'), 'utf8');
    const dependencies = [...renderer.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
    assert.deepEqual(dependencies, ['node:crypto']);
    assert.doesNotMatch(renderer, /\bimport\s*\(|\b(?:fetch|WebSocket|XMLHttpRequest)\s*\(/);
  });
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
console.log(JSON.stringify({ status: 'document-cli-check-pass', count: cases.length, cases }));
