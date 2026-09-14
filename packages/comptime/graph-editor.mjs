import { normalizeDocument } from '../graph-editor/src/model.mjs';

export const compileGraphEditor = example => Object.freeze({
  schema: 'ui-feature-input/1',
  feature: 'graph-editor',
  value: normalizeDocument(example),
});
