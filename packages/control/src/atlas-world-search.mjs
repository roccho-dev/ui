// Literal display navigation over one already accepted World frame.
// This is neither a validator nor a semantic/closure evaluator. Keep every
// qualified identity and exact record; the caller owns the displayed frame.
import { entityKey, relationKey } from './atlas-world.mjs';

export const searchAtlasWorld = (frame, query = '') => {
  if (typeof query !== 'string') throw new TypeError('atlas-world-search: query must be text');
  const needle = query.trim().toLowerCase();
  const rows = [
    ...frame.entities.map(record => ({ kind: 'entity', key: entityKey(record.ref), record })),
    ...frame.relations.map(record => ({ kind: 'relation', key: relationKey(record.ref), record })),
  ];
  return Object.freeze(rows.filter(({ key, record }) =>
    !needle || (key + '\n' + JSON.stringify(record)).toLowerCase().includes(needle)
  ).map(row => Object.freeze(row)));
};
