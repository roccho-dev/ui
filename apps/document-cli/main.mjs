#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { renderMarkdownDocument } from '../../capabilities/core-port/src/markdown-document-renderer.mjs';

const usage = 'Usage: node apps/document-cli/main.mjs model.json [template.jsonl]\n';
const fail = (code, exit = 1) => {
  process.exitCode = exit;
  process.stderr.write(`document-cli: ${code}\n`);
};
const localPath = value => !value.startsWith('-') &&
  (!/^[a-z][a-z0-9+.-]*:/i.test(value) || /^[a-z]:[\\/]/i.test(value));
const readText = async filename => new TextDecoder('utf-8', { fatal: true }).decode(await readFile(filename));

// A broken output stream must not leave a successful process exit status.
process.stdout.on('error', () => fail('E_OUTPUT'));
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') {
  process.stdout.write(usage);
} else if (args.length < 1 || args.length > 2 || !args.every(localPath)) {
  fail('E_USAGE', 2);
  process.stderr.write(usage);
} else {
  let stage = 'E_INPUT';
  try {
    const model = JSON.parse(await readText(args[0]));
    const template = args[1] === undefined ? undefined : await readText(args[1]);
    stage = 'E_RENDER';
    const result = renderMarkdownDocument({ model, template });
    if (!result.ok) {
      fail(stage);
    } else {
      stage = 'E_OUTPUT';
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } catch {
    // Input contents, paths and exception stacks are not part of this CLI's errors.
    fail(stage);
  }
}
