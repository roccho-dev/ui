import { mountFeature as mountPresentationFeature } from '../presentation/render.mjs';
import { compileBusinessModelPresentationPayload } from './presentation.mjs';
import { parseBusinessModelRuntimeJsonl } from './runtime-data.mjs';

export const mountFeature = async args => {
  const runtimeData = parseBusinessModelRuntimeJsonl(args.input);
  const payload = compileBusinessModelPresentationPayload(runtimeData);
  const mounted = await mountPresentationFeature({ ...args, input: payload });
  return Object.freeze({
    ...mounted,
    runtimeDataSchema: runtimeData.schema,
    sourceId: runtimeData.model.id,
    sourceSchema: runtimeData.model.sourceSchema,
  });
};
