import { createPresentationCatalog } from '../a2ui-browser/src/catalog/presentation.mjs';
import { A2UI_MESSAGE_VERSION } from '../a2ui-browser/src/catalog/base.mjs';
import { createSemanticMap } from '../semantic-map/domain/index.js';
import { SemanticDomainStore } from '../semantic-map/domain/authoring-store.js';
import { mountSemanticMapSurface } from '../semantic-map/surface-runtime.mjs';
import { parseBusinessModelSemanticJsonl } from '../business-model/model.mjs';
import { projectBusinessModelSemanticMapRecords } from '../business-model/semantic-map.mjs';
import { compileBusinessModelPresentationPlan } from './compiler/profile.mjs';
import { derivePublicBusinessModelProjectionProfile } from './compiler/public-profile.mjs';

const invariant = (condition, message) => { if (!condition) throw new Error(`presentation-model: ${message}`); };
const objectById = items => Object.freeze(Object.fromEntries(items.map(item => [item.id, Object.freeze({ ...item })])));
const clone = value => structuredClone(value);

const dataModelFor = ({ model, plan, profile }) => Object.freeze({
  schema: 'business-model-profiled-view/1',
  source: Object.freeze({ schema: model.sourceSchema, id: model.id }),
  title: model.title,
  kicker: model.kicker,
  profile: Object.freeze({ schema: profile.schema, id: profile.id, label: profile.label }),
  currentIndex: 0,
  stages: Object.freeze(model.stages.map(stage => Object.freeze({ ...stage }))),
  actors: objectById(model.actors),
  nodesByActor: Object.freeze(Object.fromEntries(Object.entries(plan.nodesByActor).map(([id, nodes]) => [id, Object.freeze(nodes.map(node => Object.freeze({ ...node })))]))),
  exchanges: objectById(model.exchanges),
  activities: objectById(model.activities),
  columns: Object.freeze(plan.columns.map(column => Object.freeze({ ...column }))),
});

export const createFeaturePlan = async ({ design, input }) => {
  invariant(design.app === 'presentation', 'presentation design required');
  invariant(typeof input.presentation === 'string' && input.presentation.trim(), 'presentation.jsonl input required');
  invariant(typeof design.profileId === 'string' && design.profileId, 'design.profileId required');
  invariant(typeof design.mainSurfaceId === 'string' && design.mainSurfaceId, 'design.mainSurfaceId required');
  const model = parseBusinessModelSemanticJsonl(input.presentation);
  const profile = derivePublicBusinessModelProjectionProfile(model);
  invariant(profile.id === design.profileId, 'design.profileId mismatch');
  const presentationPlan = compileBusinessModelPresentationPlan(model, profile);
  const catalog = createPresentationCatalog({ id: design.catalogId });
  const seqStore = new SemanticDomainStore(createSemanticMap(projectBusinessModelSemanticMapRecords(model)));
  const viewModel = dataModelFor({ model, plan: presentationPlan, profile });

  return Object.freeze({
    catalog,
    messages: Object.freeze(design.messages.map(clone)),
    schema: 'ui-presentation-runtime/1',
    attach: async ({ mountSurface, root, scope }) => {
      const document = root.ownerDocument;
      const surfaceMount = root.querySelector('[data-a2ui-id="presentation-surface"]');
      const seqRoot = root.querySelector('[data-a2ui-id="presentation-seq"]');
      invariant(surfaceMount, 'presentation surface slot missing');
      invariant(seqRoot, 'presentation seq shell missing');
      const seqMount = seqRoot.querySelector('.seq-mount');
      const shell = seqRoot.querySelector('.seq-shell');
      const backdrop = seqRoot.querySelector('.seq-backdrop');
      const open = seqRoot.querySelector('.seq-open');
      const close = seqRoot.querySelector('.seq-close');
      const current = seqRoot.querySelector('.seq-current');
      invariant(seqMount && shell && backdrop && open && close && current, 'presentation seq controls missing');

      let currentStageIndex = 0;
      let expanded = false;
      let preview = false;
      let seq = null;
      const stageByFocus = new Map(model.stages.map((stage, index) => [stage.focusRef, index]));
      const setShellState = () => {
        shell.dataset.preview = String(preview && !expanded);
        shell.dataset.expanded = String(expanded);
        backdrop.dataset.open = String(expanded);
        backdrop.setAttribute('aria-hidden', String(!expanded));
        open.setAttribute('aria-expanded', String(expanded));
        close.hidden = !expanded;
        document.body.classList.toggle('seq-expanded', expanded);
      };
      const refreshSeqLayout = () => scope.queueMicrotask(() => seq?.fit());
      const closeSeq = () => { expanded = false; preview = false; setShellState(); refreshSeqLayout(); };
      const openSeq = () => {
        expanded = true;
        preview = false;
        setShellState();
        refreshSeqLayout();
        scope.queueMicrotask(() => close.focus());
      };

      let innerRuntime = null;
      const applyStage = (index, { focus = false } = {}) => {
        const stage = model.stages[index];
        invariant(stage, `stage missing: ${index}`);
        innerRuntime.push({
          version: A2UI_MESSAGE_VERSION,
          updateDataModel: { surfaceId: design.mainSurfaceId, path: '/currentIndex', value: index },
        });
        currentStageIndex = index;
        document.documentElement.dataset.stage = stage.id;
        current.textContent = stage.name;
        seq?.focus(stage.focusRef);
        if (focus) scope.queueMicrotask(() => surfaceMount.querySelectorAll('.profiled-timeline button')[index]?.focus());
        return innerRuntime.read();
      };
      const handleAction = detail => {
        if (detail?.action !== 'business-model-profiled.select-stage') return;
        const index = detail.context?.index;
        if (Number.isSafeInteger(index)) applyStage(index, { focus: detail.context?.focus === true });
      };
      innerRuntime = mountSurface({
        catalog,
        catalogId: design.catalogId,
        messages: [
          { version: A2UI_MESSAGE_VERSION, createSurface: { surfaceId: design.mainSurfaceId, catalogId: design.catalogId, sendDataModel: true } },
          { version: A2UI_MESSAGE_VERSION, updateDataModel: { surfaceId: design.mainSurfaceId, path: '/', value: clone(viewModel) } },
          { version: A2UI_MESSAGE_VERSION, updateComponents: { surfaceId: design.mainSurfaceId, components: [{ id: 'model-root', component: 'ProfiledBusinessModel', action: 'business-model-profiled.select-stage' }] } },
        ],
        mount: surfaceMount,
        onAction: handleAction,
        requiredRootIds: ['model-root'],
        rootId: 'model-root',
        surfaceId: design.mainSurfaceId,
      });

      const semanticSurface = await mountSemanticMapSurface({
        featureId: 'seq',
        mode: 'view',
        pattern: 'seq/1',
        root: seqMount,
        scope,
        store: seqStore,
      });
      seq = Object.freeze({
        fit: semanticSurface.fit,
        focus: regionId => semanticSurface.adapter.setFocusMarker(regionId),
        read: semanticSurface.read,
      });
      semanticSurface.adapter.onSelectionChange(selection => {
        if (selection.regionIds.length !== 1) return;
        const index = stageByFocus.get(selection.regionIds[0]);
        if (!Number.isSafeInteger(index)) return;
        applyStage(index);
        closeSeq();
      });

      const canHover = scope.matchMedia('(hover:hover) and (pointer:fine)');
      shell.addEventListener('mouseenter', () => {
        if (canHover.matches && !expanded) { preview = true; setShellState(); refreshSeqLayout(); }
      });
      shell.addEventListener('mouseleave', () => {
        if (!expanded) { preview = false; setShellState(); refreshSeqLayout(); }
      });
      shell.addEventListener('transitionend', () => seq?.fit());
      open.addEventListener('click', openSeq);
      close.addEventListener('click', closeSeq);
      backdrop.addEventListener('click', closeSeq);

      current.textContent = model.stages[0].name;
      seq.focus(model.stages[0].focusRef);
      setShellState();
      document.documentElement.dataset.stage = model.stages[0].id;
      return Object.freeze({
        applyStage,
        closeSeq,
        openSeq,
        read: () => Object.freeze({ currentStageIndex, expanded, preview, runtime: innerRuntime.read(), seq: seq.read() }),
        runtimeDataSchema: 'business-model-runtime-data/1',
        schema: 'ui-presentation-runtime/1',
        sourceId: model.id,
        sourceSchema: model.sourceSchema,
      });
    },
  });
};
