import {readFile} from 'node:fs/promises';
import {validateAtlasMessages} from '../src/a2ui/validate-messages.js';

const path = new URL('../public/a2ui/purpose-atlas.surface.jsonl', import.meta.url);
const text = await readFile(path, 'utf8');
const messages = text
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`line ${index + 1}: ${error.message}`); }
  });

validateAtlasMessages(messages);

const components = messages.find((message) => message.updateComponents)?.updateComponents?.components || [];
const ids = new Set(components.map((component) => component.id));
for (const child of ['root', 'atlas-header', 'atlas-toolbar', 'atlas-canvas', 'atlas-inspector', 'atlas-toast']) {
  if (!ids.has(child)) throw new Error(`Missing A2UI component: ${child}`);
}
console.log(`A2UI JSONL valid: ${messages.length} messages, ${components.length} allowlisted components.`);
