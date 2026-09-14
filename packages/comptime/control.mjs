import { connectControl, parseControl } from '../control/src/control-graph.mjs';

export const compileControl = jsonl => {
  if (typeof jsonl !== 'string' || !jsonl.trim()) throw new Error('comptime.control: non-empty JSONL required');
  connectControl(parseControl(jsonl));
  return Object.freeze({
    schema: 'ui-feature-input/1',
    feature: 'control',
    value: jsonl.endsWith('\n') ? jsonl : `${jsonl}\n`,
  });
};
