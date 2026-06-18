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
if (components.length !== 1 || components[0].id !== 'root' || components[0].component !== 'AtlasSourceSurface') {
  throw new Error('The A2UI surface must contain exactly the allowlisted AtlasSourceSurface root.');
}
const actions = Object.values(components[0]).filter((value) => value?.event?.name).map((value) => value.event.name);
if (new Set(actions).size !== 15) throw new Error(`Expected 15 A2UI actions, found ${new Set(actions).size}.`);
console.log(`A2UI JSONL valid: ${messages.length} messages, 1 source-UI component, 15 allowlisted actions.`);
