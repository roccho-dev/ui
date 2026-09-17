import { stateRecordsToJSONL } from '../semantic-map/protocol/index.js';
import { mountFeature as mountSemanticMapFeature } from '../semantic-map/feature-runtime.mjs';
import { parseBusinessModelRuntimeJsonl } from './runtime-data.mjs';
import { projectBusinessModelSemanticMapRecords } from './semantic-map.mjs';

export const mountFeature = async args => {
  const runtimeData = parseBusinessModelRuntimeJsonl(args.input);
  const semanticRecords = projectBusinessModelSemanticMapRecords(runtimeData.model);
  const projectedIds = new Set(semanticRecords.map(record => record.id).filter(Boolean));
  const projectedPins = runtimeData.dataPins.filter(pin => projectedIds.has(pin.targetId));
  const semanticInput = stateRecordsToJSONL([...semanticRecords, ...projectedPins]);
  const mounted = await mountSemanticMapFeature({ ...args, input: semanticInput });
  return Object.freeze({
    ...mounted,
    runtimeDataSchema: runtimeData.schema,
    sourceId: runtimeData.model.id,
    sourceSchema: runtimeData.model.sourceSchema,
  });
};
