// A browser proof keeps every file it writes under its --out directory, never
// the system temp directory: its scratch inputs in <out>/scratch, and, through
// TMPDIR, the temporary files of Node and of the browser it launches (the
// Chromium profile included). `done()` removes the scratch.
import fs from 'node:fs';
import path from 'node:path';

export const proofScratch = out => {
  fs.mkdirSync(out);
  const scratch = path.join(path.resolve(out), 'scratch');
  fs.mkdirSync(scratch);
  process.env.TMPDIR = scratch;
  return Object.freeze({ scratch, done: () => fs.rmSync(scratch, { recursive: true, force: true }) });
};
