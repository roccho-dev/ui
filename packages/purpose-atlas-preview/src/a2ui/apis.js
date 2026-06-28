import {z} from 'zod';
import {CommonSchemas} from '@a2ui/web_core/v0_9';

export const ATLAS_CATALOG_ID = 'https://visualize-layers.dev/a2ui/catalogs/purpose-atlas/v6-source-ui';

const surfaceSchema = z.object({
  document: z.any(),
  snapshot: CommonSchemas.DynamicValue,
  step: CommonSchemas.DynamicNumber,
  maxStep: CommonSchemas.DynamicNumber,
  playing: CommonSchemas.DynamicBoolean,
  viewMode: CommonSchemas.DynamicString,
  viewport: CommonSchemas.DynamicValue,
  selection: CommonSchemas.DynamicValue,
  events: CommonSchemas.DynamicValue,
  operations: CommonSchemas.DynamicValue,
  toast: CommonSchemas.DynamicValue,
  onReset: CommonSchemas.Action,
  onPrevious: CommonSchemas.Action,
  onNext: CommonSchemas.Action,
  onTogglePlay: CommonSchemas.Action,
  onStepChanged: CommonSchemas.Action,
  onModeChanged: CommonSchemas.Action,
  onFit: CommonSchemas.Action,
  onZoomIn: CommonSchemas.Action,
  onZoomOut: CommonSchemas.Action,
  onSelect: CommonSchemas.Action,
  onRecordMismatch: CommonSchemas.Action,
  onRequestOwner: CommonSchemas.Action,
  onHoldDecision: CommonSchemas.Action,
  onStepForward: CommonSchemas.Action,
  onClearSelection: CommonSchemas.Action,
}).strict();

export const A2uiSduiSurfaceApi = {name: 'A2uiSduiSurface', schema: surfaceSchema};
export const AtlasSourceSurfaceApi = {...A2uiSduiSurfaceApi, name: 'AtlasSourceSurface'};

export const ATLAS_COMPONENT_APIS = new Map([
  A2uiSduiSurfaceApi,
  AtlasSourceSurfaceApi,
].map((api) => [api.name, api]));

export const ALLOWED_ATLAS_ACTIONS = new Set([
  'atlas.reset', 'atlas.previous', 'atlas.next', 'atlas.togglePlay',
  'atlas.stepChanged', 'atlas.modeChanged', 'atlas.fit', 'atlas.zoomIn',
  'atlas.zoomOut', 'atlas.select', 'atlas.recordMismatch', 'atlas.requestOwner',
  'atlas.holdDecision', 'atlas.stepForward', 'atlas.clearSelection',
]);
