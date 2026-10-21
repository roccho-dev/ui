// The Atlas browser proofs and the composition gate write nothing to the
// system temp directory: each takes --out, keeps its scratch there and points
// TMPDIR there before launching the browser (fixtures/proof-scratch.mjs), so
// the Chromium profile is under --out too.
// check-live-atlas.mjs is not one of them: it runs inside the Nix build too,
// whose source tree is read-only, so it keeps os.tmpdir() (the sandbox's build
// directory there; locally, TMPDIR is pointed into the worktree).
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dir = new URL('./', import.meta.url);
const files = fs.readdirSync(dir).filter(name => /^atlas-.*(browser-proof|composition-gate)\.mjs$/u.test(name)).sort();
assert.ok(files.length >= 8, 'the Atlas browser proofs and the gate are found: ' + files.join(', '));
for (const name of files) {
  const text = fs.readFileSync(new URL(name, dir), 'utf8');
  assert.ok(!/\btmpdir\b|mkdtemp/u.test(text), name + ': no system temp directory (os.tmpdir / mkdtemp)');
  assert.ok(/proofScratch\(/u.test(text), name + ': keeps its scratch and TMPDIR under --out');
}
console.log(JSON.stringify({ status: 'atlas-proof-scratch-checks-pass', files: files.length }));
