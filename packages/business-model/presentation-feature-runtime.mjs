import { createSemanticMap } from '../semantic-map/domain/index.js';
import { SemanticDomainStore } from '../semantic-map/domain/authoring-store.js';
import { mountSemanticMapSurface } from '../semantic-map/surface-runtime.mjs';
import { mountFeature as mountPresentationFeature } from '../presentation/render.mjs';
import { compileBusinessModelPresentationPayload } from './presentation.mjs';
import { parseBusinessModelRuntimeJsonl } from './runtime-data.mjs';
import { projectBusinessModelSemanticMapRecords } from './semantic-map.mjs';

export const mountFeature = async args => {
  const runtimeData = parseBusinessModelRuntimeJsonl(args.input);
  const payload = compileBusinessModelPresentationPayload(runtimeData);
  const records = projectBusinessModelSemanticMapRecords(runtimeData.model);
  const seqStore = new SemanticDomainStore(createSemanticMap(records));
  const seqView = Object.freeze({
    mount: async ({ root, scope = globalThis, onActivate }) => {
      const surface = await mountSemanticMapSurface({
        featureId: 'seq',
        mode: 'view',
        pattern: 'seq/1',
        root,
        scope,
        store: seqStore,
      });
      surface.adapter.onSelectionChange(selection => {
        if (selection.regionIds.length === 1) onActivate?.(selection.regionIds[0]);
      });
      return Object.freeze({
        fit: surface.fit,
        focus: regionId => surface.adapter.setFocusMarker(regionId),
        read: surface.read,
      });
    },
  });
  const mounted = await mountPresentationFeature({ ...args, input: payload, seqView });
  return Object.freeze({
    ...mounted,
    runtimeDataSchema: runtimeData.schema,
    sourceId: runtimeData.model.id,
    sourceSchema: runtimeData.model.sourceSchema,
  });
};
