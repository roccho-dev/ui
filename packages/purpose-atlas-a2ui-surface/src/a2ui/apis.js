import {z} from 'zod';
import {CommonSchemas} from '@a2ui/web_core/v0_9';

export const ATLAS_CATALOG_ID = 'https://visualize-layers.dev/a2ui/catalogs/purpose-atlas/v6';

export const AtlasShellApi = {
  name: 'AtlasShell',
  schema: z.object({
    header: z.string(),
    toolbar: z.string(),
    canvas: z.string(),
    inspector: z.string(),
    toast: z.string(),
  }).strict(),
};

export const AtlasHeaderApi = {
  name: 'AtlasHeader',
  schema: z.object({
    title: CommonSchemas.DynamicString,
    subtitle: CommonSchemas.DynamicString,
    step: CommonSchemas.DynamicNumber,
    maxStep: CommonSchemas.DynamicNumber,
    guard: CommonSchemas.DynamicValue,
    counts: CommonSchemas.DynamicValue,
    composition: CommonSchemas.DynamicValue,
    protocol: CommonSchemas.DynamicString,
  }).strict(),
};

export const AtlasToolbarApi = {
  name: 'AtlasToolbar',
  schema: z.object({
    step: CommonSchemas.DynamicNumber,
    maxStep: CommonSchemas.DynamicNumber,
    playing: CommonSchemas.DynamicBoolean,
    viewMode: CommonSchemas.DynamicString,
    events: CommonSchemas.DynamicValue,
    onReset: CommonSchemas.Action,
    onPrevious: CommonSchemas.Action,
    onNext: CommonSchemas.Action,
    onTogglePlay: CommonSchemas.Action,
    onStepChanged: CommonSchemas.Action,
    onModeChanged: CommonSchemas.Action,
    onFit: CommonSchemas.Action,
    onZoomIn: CommonSchemas.Action,
    onZoomOut: CommonSchemas.Action,
  }).strict(),
};

export const AtlasCanvasApi = {
  name: 'AtlasCanvas',
  schema: z.object({
    snapshot: CommonSchemas.DynamicValue,
    viewport: CommonSchemas.DynamicValue,
    selection: CommonSchemas.DynamicValue,
    viewMode: CommonSchemas.DynamicString,
    onSelect: CommonSchemas.Action,
  }).strict(),
};

export const AtlasInspectorApi = {
  name: 'AtlasInspector',
  schema: z.object({
    details: CommonSchemas.DynamicValue,
    guard: CommonSchemas.DynamicValue,
    eventLog: CommonSchemas.DynamicValue,
    cxo: CommonSchemas.DynamicValue,
    operations: CommonSchemas.DynamicValue,
    lastEvent: CommonSchemas.DynamicString,
    onRecordMismatch: CommonSchemas.Action,
    onRequestOwner: CommonSchemas.Action,
    onHoldDecision: CommonSchemas.Action,
    onStepForward: CommonSchemas.Action,
    onClearSelection: CommonSchemas.Action,
  }).strict(),
};

export const AtlasToastApi = {
  name: 'AtlasToast',
  schema: z.object({toast: CommonSchemas.DynamicValue}).strict(),
};

export const ATLAS_COMPONENT_APIS = new Map([
  AtlasShellApi,
  AtlasHeaderApi,
  AtlasToolbarApi,
  AtlasCanvasApi,
  AtlasInspectorApi,
  AtlasToastApi,
].map((api) => [api.name, api]));

export const ALLOWED_ATLAS_ACTIONS = new Set([
  'atlas.reset',
  'atlas.previous',
  'atlas.next',
  'atlas.togglePlay',
  'atlas.stepChanged',
  'atlas.modeChanged',
  'atlas.fit',
  'atlas.zoomIn',
  'atlas.zoomOut',
  'atlas.select',
  'atlas.recordMismatch',
  'atlas.requestOwner',
  'atlas.holdDecision',
  'atlas.stepForward',
  'atlas.clearSelection',
]);
