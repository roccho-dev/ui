// Test fixture: consume registry JSONL and produce a projected component/view
// output, with no browser side effects (C14).
//
//   node tests/fixtures/project-registry.mjs
//
// It projects both the A2UI recursive demo and the standalone questionnaire
// flow through the same default registry, proving the questionnaire is
// registry-driven rather than a separate UI island.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  defaultRegistry,
  projectA2uiSurface,
  projectQuestionnaireFlow,
  toUiLog,
  makeTargetRef,
} from "../../src/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJsonl(rel) {
  return fs
    .readFileSync(path.join(root, rel), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => JSON.parse(line));
}

const registry = defaultRegistry();

// 1) A2UI recursive surface (slide + questionnaire share one primitive tree).
const a2uiRecords = readJsonl("tests/fixtures/a2ui-recursive.demo.jsonl");
const a2uiView = projectA2uiSurface(a2uiRecords, registry);

// 2) Standalone questionnaire flow projected into registry components.
const flowRecords = readJsonl("tests/fixtures/questionnaire.flow.jsonl");
const flowView = projectQuestionnaireFlow(flowRecords, registry);

// 3) A non-authority UI log record routed to a model element via targetRef.
const log = toUiLog(
  { kind: "ui.log.record.v1", event: "answer.append", value: "options" },
  { targetRef: makeTargetRef({ kind: "projectionNode", id: flowView.tree.root.children[0]?.id || "q_intent" }) }
);

console.log(
  JSON.stringify(
    {
      status: "ui-registry-fixture-ok",
      registry: { kind: registry.kind, families: registry.families(), componentCount: registry.list().length },
      a2ui: {
        kind: a2uiView.kind,
        hasTree: a2uiView.hasTree,
        rootType: a2uiView.tree?.root.type,
        nodeCount: a2uiView.tree?.nodeCount,
        unknownTypes: a2uiView.tree?.unknownTypes,
        emittableEvents: a2uiView.emittableEvents,
        errors: a2uiView.errors,
      },
      questionnaire: {
        kind: flowView.kind,
        rootType: flowView.tree?.root.type,
        questionCount: flowView.tree?.root.children.filter((c) => c.type === "Question").length,
        resultCount: flowView.tree?.root.children.filter((c) => c.type === "Result").length,
        unknownTypes: flowView.tree?.unknownTypes,
        emittableEvents: flowView.emittableEvents,
      },
      log: { payloadKind: log.payloadKind, targetRef: log.targetRef, canonicalStatus: log.meta.canonicalStatus, approval: log.meta.approval },
    },
    null,
    2
  )
);
