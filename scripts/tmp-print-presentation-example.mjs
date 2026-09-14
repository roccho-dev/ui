import fs from 'node:fs/promises';
import { compilePresentation } from '../packages/comptime/presentation.mjs';

const source = await fs.readFile('examples/presentation/2-actors.jsonl', 'utf8');
const compiled = await compilePresentation(source);
await fs.writeFile('examples/presentation/example.json', `${JSON.stringify(compiled, null, 2)}\n`);
