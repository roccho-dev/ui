import { recordsToJSONL } from '../semantic-map/domain/index.js';
import { mountFeature as mountSemanticMapFeature } from '../semantic-map/feature-runtime.mjs';
import { parseBusinessModelRuntimeJsonl } from './runtime-data.mjs';
import { projectBusinessModelSemanticMapRecords } from './semantic-map.mjs';

export const mountFeature = async args => {
  const runtimeData = parseBusinessModelRuntimeJsonl(args.input);
  const semanticInput = recordsToJSONL(projectBusinessModelSemanticMapRecords(runtimeData.model));
  const mounted = await mountSemanticMapFeature({ ...args, input: semanticInput });
  return Object.freeze({
    ...mounted,
    runtimeDataSchema: runtimeData.schema,
    sourceId: runtimeData.model.id,
    sourceSchema: runtimeData.model.sourceSchema,
  });
};
