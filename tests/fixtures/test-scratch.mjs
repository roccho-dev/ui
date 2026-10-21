// A Node check's scratch directory, never the User's system temp directory.
// In a checkout the source is writable: the scratch sits next to the tests
// (tests/.scratch-<name>-*). Inside the Nix build (`nix flake check`) the
// source is the read-only store path: the scratch sits in the build sandbox's
// own TMPDIR (NIX_BUILD_TOP), removed with the sandbox. A read-only source
// outside a Nix build is refused rather than written to /tmp. `done()`
// removes the scratch.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const testScratch = name => {
  let root = testsDir;
  try {
    fs.accessSync(testsDir, fs.constants.W_OK);
  } catch {
    if (!process.env.NIX_BUILD_TOP || !process.env.TMPDIR) throw new Error(name + ': the source is read-only and this is not a Nix build; run it from a checkout');
    root = process.env.TMPDIR;
  }
  const dir = fs.mkdtempSync(path.join(root, '.scratch-' + name + '-'));
  return Object.freeze({ dir, done: () => fs.rmSync(dir, { recursive: true, force: true }) });
};
