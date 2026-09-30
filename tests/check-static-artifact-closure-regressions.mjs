import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(new URL('./check-static-artifact-closure.mjs', import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-artifact-closure-'));
const cases = [];
const write = (root, name, text = '') => {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  return target;
};
const run = args => {
  const result = spawnSync(process.execPath, [checker, ...args], {
    cwd: scratch, encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: '' },
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
};
const check = (name, setup, expectedReason = null) => {
  const root = fs.mkdtempSync(path.join(scratch, 'artifact-'));
  const args = setup(root) ?? [root];
  const result = run(args);
  if (expectedReason) {
    assert.notEqual(result.status, 0, `${name}: must fail`);
    assert.equal(result.stdout, '', `${name}: failed scope must not emit PASS`);
    const report = JSON.parse(result.stderr);
    assert.equal(report.status, 'FAIL');
    assert.ok(report.failures.some(item => item.reason === expectedReason), result.stderr);
  } else {
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    assert.equal(report.schema, 'ui-static-artifact-closure/1');
    assert.equal(report.status, 'PASS');
    assert.ok(report.files > 0);
  }
  cases.push(name);
};
try {
  check('root-required', () => [], 'artifact-root-required');
  check('extra-root-rejected', root => [root, root], 'artifact-root-required');
  check('blank-root-rejected', () => [' '], 'artifact-root-required');
  check('missing-root-rejected', root => [path.join(root, 'absent')], 'invalid-artifact-root');
  check('file-root-rejected', root => [write(root, 'file.txt')], 'invalid-artifact-root');
  check('empty-module-scope-rejected', () => {}, 'empty-module-scope');
  check('single-module', root => { write(root, 'index.mjs', 'export const value = 1;\n'); });
  check('relative-module', root => {
    write(root, 'index.mjs', 'import "./nested/value.js";\n');
    write(root, 'nested/value.js', 'export const value = 1;\n');
  });
  check('root-relative-resource-and-query', root => {
    write(root, 'index.mjs', 'import "/nested/value.js?v=1#view";\n');
    write(root, 'nested/value.js', 'new URL("../image.svg", import.meta.url);\n');
    write(root, 'image.svg', '<svg/>');
  });
  check('literal-dynamic-import', root => {
    write(root, 'index.mjs', 'await import("./nested/value.js");\n');
    write(root, 'nested/value.js');
  });
  check('existing-network-specifier-policy', root => {
    // This check still scopes local dependencies, not network policy or arbitrary JS.
    write(root, 'index.mjs', 'import "https://example.invalid/module.mjs";\n');
  });
  check('missing-module-rejected', root => {
    write(root, 'index.mjs', 'import "./absent.js";\n');
  }, 'missing-static-dependency');
  check('directory-is-not-module', root => {
    write(root, 'index.mjs', 'import "./directory";\n');
    fs.mkdirSync(path.join(root, 'directory'));
  }, 'static-dependency-not-file');
  check('bare-import-rejected', root => {
    write(root, 'index.mjs', 'import "missing-package";\n');
  }, 'bare-import');
  check('parent-escape-rejected', root => {
    write(scratch, 'outside.mjs', 'export const value = 1;\n');
    write(root, 'index.mjs', 'import "../outside.mjs";\n');
  }, 'static-dependency-escape');
  check('sibling-prefix-escape-rejected', root => {
    const sibling = `${root}-outside`;
    write(sibling, 'value.js');
    write(root, 'index.mjs', `import "../${path.basename(sibling)}/value.js";\n`);
  }, 'static-dependency-escape');
  check('outside-symlink-rejected', root => {
    write(scratch, 'outside.mjs');
    fs.symlinkSync(path.join(scratch, 'outside.mjs'), path.join(root, 'alias.mjs'));
    write(root, 'index.mjs', 'import "./alias.mjs";\n');
  }, 'artifact-entry-escape');
  check('dangling-symlink-rejected', root => {
    fs.symlinkSync(path.join(root, 'absent.js'), path.join(root, 'alias.js'));
    write(root, 'index.mjs', 'import "./alias.js";\n');
  }, 'unresolved-artifact-entry');
  check('inside-symlink-accepted', root => {
    write(root, 'value.mjs', 'export const value = 1;\n');
    fs.symlinkSync(path.join(root, 'value.mjs'), path.join(root, 'alias.mjs'));
    write(root, 'index.mjs', 'import "./alias.mjs";\n');
  });
  check('directory-symlink-cycle-is-bounded', root => {
    write(root, 'index.mjs');
    fs.symlinkSync(root, path.join(root, 'self'));
  });
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
console.log(JSON.stringify({ status: 'static-artifact-closure-regressions-pass', count: cases.length, cases }));
