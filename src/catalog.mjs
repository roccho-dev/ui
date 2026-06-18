// Default component catalog for ui.component.registry.v1.
//
// These entries are derived from the A2UI recursive adapter split PoC
// (primitives / slide / questionnaire adapters) and the need_zoom surface
// modeling. They are renderer-neutral descriptors only: no DOM, no HTML.
// Adding a new component (e.g. a future "form" or "chart" family) is one more
// defineComponent() call and requires no schema change (C03).

import { defineComponent, makeRegistry } from "./registry.mjs";

const HTML_PRODUCES = ["html.element", "sdui.component.v1"];

// --- primitives: shared recursive primitives (A2UI primitiveAdapter) ---
export const primitiveComponents = [
  defineComponent({ id: "App", family: "primitive", stability: "stable", description: "recursive app root container", producesOutputKinds: HTML_PRODUCES }),
  defineComponent({ id: "Defs", family: "primitive", stability: "stable", description: "template definitions; not rendered directly", childrenPolicy: "templated", producesOutputKinds: [] }),
  defineComponent({ id: "View", family: "layout", stability: "stable", description: "named view shown when state path matches", props: ["name", "path"], state: ["/view"], producesOutputKinds: HTML_PRODUCES }),
  defineComponent({ id: "Stack", family: "layout", stability: "stable", description: "vertical stack with gap", props: ["gap"], producesOutputKinds: HTML_PRODUCES }),
  defineComponent({ id: "Row", family: "layout", stability: "stable", description: "horizontal row", producesOutputKinds: HTML_PRODUCES }),
  defineComponent({ id: "Title", family: "primitive", stability: "stable", description: "heading text", props: ["text", "level"], producesOutputKinds: HTML_PRODUCES }),
  defineComponent({ id: "Text", family: "primitive", stability: "stable", description: "paragraph text", props: ["text"], producesOutputKinds: HTML_PRODUCES }),
  defineComponent({ id: "Note", family: "primitive", stability: "stable", description: "secondary note text", props: ["text"], producesOutputKinds: HTML_PRODUCES }),
  defineComponent({ id: "List", family: "layout", stability: "stable", description: "list container", producesOutputKinds: HTML_PRODUCES }),
  defineComponent({ id: "Item", family: "primitive", stability: "stable", description: "list item", props: ["text"], producesOutputKinds: HTML_PRODUCES }),
  defineComponent({ id: "ActionRow", family: "layout", stability: "stable", description: "row of action buttons", producesOutputKinds: HTML_PRODUCES }),
  defineComponent({ id: "Action", family: "action", stability: "stable", description: "button dispatching a named intent", props: ["action", "value", "text"], actions: ["view.set", "state.set", "state.merge"], events: ["ActionEvent"], producesOutputKinds: HTML_PRODUCES }),
  defineComponent({ id: "Ref", family: "primitive", stability: "stable", description: "instantiate a template by id with vars", props: ["target", "vars"], childrenPolicy: "generated", producesOutputKinds: HTML_PRODUCES }),
  defineComponent({ id: "When", family: "layout", stability: "stable", description: "conditional wrapper on var/state", props: ["var", "state", "eq"], producesOutputKinds: HTML_PRODUCES }),
  defineComponent({ id: "Svg", family: "primitive", stability: "stable", description: "svg root", props: ["viewBox", "ariaLabel"], producesOutputKinds: ["svg.element"] }),
  defineComponent({ id: "Group", family: "primitive", stability: "stable", description: "svg group", props: ["class", "showWhen"], producesOutputKinds: ["svg.element"] }),
  defineComponent({ id: "Circle", family: "primitive", stability: "stable", description: "svg circle", props: ["cx", "cy", "r", "class"], childrenPolicy: "none", producesOutputKinds: ["svg.element"] }),
  defineComponent({ id: "Line", family: "primitive", stability: "stable", description: "svg line", props: ["x1", "y1", "x2", "y2", "class"], childrenPolicy: "none", producesOutputKinds: ["svg.element"] }),
  defineComponent({ id: "Rect", family: "primitive", stability: "stable", description: "svg rect", props: ["x", "y", "width", "height", "class"], childrenPolicy: "none", producesOutputKinds: ["svg.element"] }),
  defineComponent({ id: "SvgText", family: "primitive", stability: "stable", description: "svg text", props: ["x", "y", "text", "class"], childrenPolicy: "none", producesOutputKinds: ["svg.element"] }),
];

// --- slide: deck/slide navigation (A2UI slideAdapter) ---
export const slideComponents = [
  defineComponent({ id: "Deck", family: "slide", stability: "stable", description: "slide deck showing one slide at a time", props: ["indexPath"], state: ["/slideIndex"], actions: ["slide.next", "slide.prev", "slide.go"], producesOutputKinds: HTML_PRODUCES }),
  defineComponent({ id: "Slide", family: "slide", stability: "stable", description: "single slide", producesOutputKinds: HTML_PRODUCES }),
];

// --- questionnaire/flow: exclusive question flow (A2UI questionnaireAdapter) ---
// Integrates the standalone questionnaire PoC as a registry component family
// rather than a separate monolithic UI island (C10).
export const questionnaireComponents = [
  defineComponent({ id: "QuestionFlow", family: "questionnaire", stability: "stable", description: "exclusive question flow driven by current-question state", props: ["currentPath", "initial"], state: ["/questionnaire/current"], producesOutputKinds: HTML_PRODUCES }),
  defineComponent({ id: "Question", family: "questionnaire", stability: "stable", description: "single question node", producesOutputKinds: HTML_PRODUCES }),
  defineComponent({ id: "Result", family: "questionnaire", stability: "stable", description: "terminal result node", producesOutputKinds: HTML_PRODUCES }),
  defineComponent({ id: "ChoiceGroup", family: "questionnaire", stability: "stable", description: "group of choices, exclusive or multiple", props: ["exclusive"], producesOutputKinds: HTML_PRODUCES }),
  defineComponent({ id: "Choice", family: "questionnaire", stability: "stable", description: "single answer choice that advances the flow", props: ["value", "label", "next", "questionId", "hint"], state: ["/questionnaire/answers"], actions: ["answer.set", "question.go"], events: ["AnswerEvent"], producesOutputKinds: HTML_PRODUCES }),
  defineComponent({ id: "AnswerSummary", family: "questionnaire", stability: "stable", description: "generated summary of recorded answers", props: ["path", "label"], state: ["/questionnaire/answers"], childrenPolicy: "generated", producesOutputKinds: HTML_PRODUCES }),
];

// --- need_zoom: voronoi surface modeling components ---
// These mirror the existing projectNeedZoomSurface payload kinds so the
// need_zoom surface is describable as registry components too.
export const needZoomComponents = [
  defineComponent({ id: "need_zoom.surface_config.v1", family: "need_zoom", stability: "stable", description: "surface world/zoom config", props: ["title", "w", "h", "cell"], childrenPolicy: "none", producesOutputKinds: ["need_zoom.voronoi_surface.v1"] }),
  defineComponent({ id: "need_zoom.facet.v1", family: "need_zoom", stability: "stable", description: "facet color/label", props: ["id", "color", "label"], childrenPolicy: "none", producesOutputKinds: ["need_zoom.voronoi_surface.v1"] }),
  defineComponent({ id: "need_zoom.node.v1", family: "need_zoom", stability: "stable", description: "voronoi node", props: ["id", "label", "facet", "lvl", "parent", "x", "y", "r", "risk", "summary"], childrenPolicy: "none", producesOutputKinds: ["need_zoom.voronoi_surface.v1"] }),
  defineComponent({ id: "need_zoom.edge.v1", family: "need_zoom", stability: "stable", description: "voronoi edge", props: ["a", "b", "k", "w"], childrenPolicy: "none", producesOutputKinds: ["need_zoom.voronoi_surface.v1"] }),
  defineComponent({ id: "need_zoom.event.v1", family: "need_zoom", stability: "stable", description: "surface event (purpose.set, cxo.receive, ...)", props: ["type", "label", "by", "to", "topic", "node", "message", "at"], childrenPolicy: "none", events: ["need_zoom.event.v1"], producesOutputKinds: ["need_zoom.voronoi_surface.v1"] }),
];

// --- purpose_atlas: source-UI A2UI exit surface ---
// This descriptor connects the golden-witness Purpose Atlas package to the
// ui registry. It is an exit-surface adapter contract only: purpose, policy,
// guard, role, and responsibility projection authority must remain upstream.
export const purposeAtlasComponents = [
  defineComponent({
    id: "AtlasSourceSurface",
    family: "purpose_atlas",
    stability: "experimental",
    description: "single allowlisted source-UI component for the Purpose Atlas A2UI exit surface",
    props: ["snapshot", "step", "viewMode", "viewport", "selection", "onAction"],
    state: ["/meta", "/ui", "/atlas", "/inspector", "/events", "/operations", "/toast", "/runtime"],
    actions: [
      "atlas.reset",
      "atlas.previous",
      "atlas.next",
      "atlas.togglePlay",
      "atlas.stepChanged",
      "atlas.modeChanged",
      "atlas.fit",
      "atlas.zoomIn",
      "atlas.zoomOut",
      "atlas.select",
      "atlas.recordMismatch",
      "atlas.requestOwner",
      "atlas.holdDecision",
      "atlas.stepForward",
      "atlas.clearSelection",
    ],
    events: ["A2uiAction"],
    childrenPolicy: "none",
    adapterAssets: {
      package: ["packages/purpose-atlas-source-ui-golden"],
      source: [
        "src/components/atlas-source-surface.js",
        "src/ui/cached-atlas-renderer.js",
        "src/styles/source-ui.css",
      ],
      witness: ["golden/GOLDEN_LOCK.json", "scripts/verify_golden.py", "scripts/browser_verify.py"],
    },
    allowedSurfaceIds: ["purpose-atlas"],
    producesOutputKinds: ["a2ui.v0_9.surface", "html.custom-element"],
  }),
];

export const defaultEntries = [
  ...primitiveComponents,
  ...slideComponents,
  ...questionnaireComponents,
  ...needZoomComponents,
  ...purposeAtlasComponents,
];

export function defaultRegistry() {
  return makeRegistry(defaultEntries, { title: "ui default component registry", version: "v1" });
}
