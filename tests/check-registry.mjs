import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  defineComponent,
  makeRegistry,
  defaultRegistry,
  assertRegistry,
  projectNodeTree,
  projectA2uiSurface,
  projectQuestionnaireFlow,
  flowToNodeTree,
  makeTargetRef,
  assertTargetRef,
  toUiLog,
  makeUiAction,
  TARGET_KINDS,
} from "../src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function readJsonl(rel) {
  return fs
    .readFileSync(path.join(root, rel), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => JSON.parse(line));
}

// --- registry contract (C02) ---
const registry = defaultRegistry();
assertRegistry(registry);
assert.equal(registry.kind, "ui.component.registry.v1");
assert.ok(registry.list().length >= 25, "default registry should carry a real catalog");

// every entry has the required contract fields
for (const entry of registry.list()) {
  assert.equal(entry.kind, "ui.component.entry.v1");
  assert.ok(entry.id, "entry has id");
  assert.ok(entry.version, "entry has version");
  assert.ok(["experimental", "stable", "deprecated"].includes(entry.stability));
  assert.ok(Array.isArray(entry.acceptsInputKinds));
  assert.ok(Array.isArray(entry.producesOutputKinds));
}

// --- A2UI/SDUI families are first-class (C03) ---
const families = registry.families();
for (const fam of ["primitive", "layout", "action", "slide", "questionnaire", "need_zoom"]) {
  assert.ok(families.includes(fam), `family ${fam} must be present`);
}
assert.ok(registry.has("Choice"), "questionnaire Choice component registered");
assert.ok(registry.has("Deck"), "slide Deck component registered");
assert.ok(registry.has("Action"), "action component registered");

// adding a future component is one defineComponent call, no schema change (C03)
const extended = makeRegistry([
  ...registry.list(),
  defineComponent({ id: "FormField", family: "form", stability: "experimental", props: ["name", "kind"] }),
]);
assert.ok(extended.has("FormField"));
assert.ok(extended.families().includes("form"));

// --- recursive lookup + deterministic unknown behavior (C05) ---
const known = registry.lookup("Choice");
assert.notEqual(known.registered, false, "known entry is not flagged unregistered");
assert.equal(known.id, "Choice");
const unknown = registry.lookup("TotallyMadeUpType");
assert.equal(unknown.registered, false, "unknown type resolves deterministically, no throw");
assert.equal(unknown.childrenPolicy, "recursive");

const tree = {
  type: "App",
  children: [
    { type: "Title", props: { text: "hi" }, children: [] },
    { type: "MysteryWidget", children: [{ type: "Text", props: { text: "deep" }, children: [] }] },
  ],
};
const treeView = projectNodeTree(tree, registry);
assert.equal(treeView.root.type, "App");
assert.equal(treeView.root.registered, true);
assert.equal(treeView.nodeCount, 4);
assert.deepEqual(treeView.unknownTypes, ["MysteryWidget"], "unknown types are reported deterministically");
// recursion reaches a registered node nested under an unknown node
const mystery = treeView.root.children.find((c) => c.type === "MysteryWidget");
assert.equal(mystery.registered, false);
assert.equal(mystery.children[0].type, "Text");
assert.equal(mystery.children[0].registered, true);

// --- A2UI surface projection, no browser side effects (C08) ---
const a2uiView = projectA2uiSurface(readJsonl("fixtures/a2ui-recursive.demo.jsonl"), registry);
assert.equal(a2uiView.kind, "ui.surface.viewmodel.v1");
assert.equal(a2uiView.hasTree, true);
assert.deepEqual(a2uiView.errors, [], "demo projects without errors");
assert.equal(a2uiView.tree.root.type, "App");
assert.deepEqual(a2uiView.tree.unknownTypes, [], "every demo node type is registered");
assert.ok(a2uiView.emittableEvents.includes("AnswerEvent"), "questionnaire AnswerEvent is emittable");
assert.ok(a2uiView.emittableEvents.includes("ActionEvent"), "Action ActionEvent is emittable");
assert.equal(a2uiView.state.slideIndex, 0, "StatePatch merge applied without DOM");

// --- questionnaire PoC integrated as registry components (C10) ---
const flowView = projectQuestionnaireFlow(readJsonl("fixtures/questionnaire.flow.jsonl"), registry);
assert.equal(flowView.tree.root.type, "QuestionFlow");
assert.deepEqual(flowView.tree.unknownTypes, [], "questionnaire flow maps entirely to registered components");
const questions = flowView.tree.root.children.filter((c) => c.type === "Question");
const results = flowView.tree.root.children.filter((c) => c.type === "Result");
assert.equal(questions.length, 3, "flow has 3 questions");
assert.equal(results.length, 7, "flow has 7 result nodes");
// every choice became a registered Choice component
const firstGroup = questions[0].children.find((c) => c.type === "ChoiceGroup");
assert.ok(firstGroup.children.every((c) => c.type === "Choice" && c.registered));

// flowToNodeTree is pure and deterministic
const t1 = flowToNodeTree({ id: "f", start: "a", nodes: { a: { id: "a", type: "single", title: "A", choices: [{ id: "x", label: "X", to: "b" }] }, b: { id: "b", type: "result", title: "B" } } });
assert.equal(t1.type, "QuestionFlow");
assert.equal(t1.children.length, 2);

// --- log targetability (C06) + non-authority boundary (C07) ---
assert.ok(TARGET_KINDS.includes("purpose") && TARGET_KINDS.includes("cxo") && TARGET_KINDS.includes("contract"));
const ref = makeTargetRef({ kind: "contract", id: "contract:exit-2026" });
assertTargetRef(ref);
assert.equal(ref.targetKind, "contract");
assert.throws(() => makeTargetRef({ kind: "nope", id: "x" }), /unknown targetRef kind/);
assert.throws(() => makeTargetRef({ kind: "purpose" }), /requires a string id/);

const log = toUiLog({ kind: "ui.log.record.v1", event: "x" }, { targetRef: ref, recordId: "ui:test", recordedAt: "2026-06-18T00:00:00Z" });
assert.equal(log.targetRef.targetId, "contract:exit-2026");
assert.equal(log.meta.canonicalStatus, "ui-log-not-authority");
assert.equal(log.meta.approval, false);
assert.equal(log.meta.authorizesFire, false);
assert.equal(log.meta.authorizesMerge, false);
// authority claim in a UI record is rejected (C07)
assert.throws(() => toUiLog({ kind: "x", mergeReady: true }, { targetRef: ref }), /must not assert authority field/);
assert.throws(() => toUiLog({ kind: "x", canonicalState: {} }, { targetRef: ref }), /must not assert authority field/);

// sample targetRef log fixture validates and stays non-authority
for (const rec of readJsonl("fixtures/ui-log-targetref.sample.jsonl")) {
  assertTargetRef(rec.targetRef);
  assert.equal(rec.meta.approval, false);
  assert.equal(rec.meta.canonicalStatus, "ui-log-not-authority");
}

// UI action carries explicit targetRef and authorizes nothing (C06/C07)
const action = makeUiAction({ id: "flag", targetRef: makeTargetRef({ kind: "evidence", id: "ev:1" }) });
assert.equal(action.targetRef.targetKind, "evidence");
assert.equal(action.authorizesFire, false);

// --- registry is consumable by sdui-policy-gate shape ---
// normalizeRegistry accepts { components: [...] } where each has an id; the
// default registry serializes to exactly that shape.
const json = registry.toJSON();
assert.ok(Array.isArray(json.components) && json.components.every((c) => c.id));

console.log(JSON.stringify({
  status: "ui-component-registry-check-pass",
  components: registry.list().length,
  families: registry.families(),
  a2uiNodeCount: a2uiView.tree.nodeCount,
  questionnaireQuestions: questions.length,
}, null, 2));
