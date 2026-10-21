// The Atlas tests write nothing to the User's system temp directory.
// - The browser proofs and the composition gate (and live-atlas-browser-e2e)
//   take --out, keep their scratch there and point TMPDIR there before
//   launching the browser (fixtures/proof-scratch.mjs), so the Chromium
//   profile is under --out too.
// - The Node checks that write files (check-live-atlas, the contract-model
//   Atlas artifact) run in a checkout and inside the Nix build, whose source
//   is read-only: fixtures/test-scratch.mjs keeps their scratch next to the
//   tests in a checkout and, in a Nix build only, in the sandbox's TMPDIR.
// None names os.tmpdir() or mkdtemp itself.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dir = new URL('./', import.meta.url);
const all = fs.readdirSync(dir).filter(name => /atlas.*\.mjs$/u.test(name) && name !== 'check-atlas-proof-scratch.mjs').sort();
const proofs = all.filter(name => /^atlas-.*(browser-proof|composition-gate)\.mjs$|^live-atlas-browser-e2e\.mjs$/u.test(name));
const scratchChecks = ['check-live-atlas.mjs', 'check-contract-model-atlas-artifact.mjs'];
assert.ok(proofs.length >= 10, 'the Atlas browser proofs, the gate and the e2e are found: ' + proofs.join(', '));
const failures = [];
for (const name of all) {
  const text = fs.readFileSync(new URL(name, dir), 'utf8');
  if (/\btmpdir\b|mkdtemp/u.test(text)) failures.push(name + ': names the system temp directory (os.tmpdir / mkdtemp)');
  if (proofs.includes(name) && !/proofScratch\(/u.test(text)) failures.push(name + ': keeps its scratch and TMPDIR under --out');
  if (scratchChecks.includes(name) && !/testScratch\(/u.test(text)) failures.push(name + ': keeps its scratch next to the tests or in the Nix sandbox');
}
assert.deepEqual(failures, [], failures.join(' | '));
console.log(JSON.stringify({ status: 'atlas-proof-scratch-checks-pass', files: all.length, proofs: proofs.length }));
