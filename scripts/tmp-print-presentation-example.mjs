import fs from 'node:fs/promises';
import { compilePresentation } from '../packages/comptime/presentation.mjs';

const source = await fs.readFile('examples/presentation/2-actors.jsonl', 'utf8');
const compiled = await compilePresentation(source);
process.stdout.write(`PRESENTATION_EXAMPLE_BASE64=${Buffer.from(JSON.stringify(compiled.value)).toString('base64')}\n`);
