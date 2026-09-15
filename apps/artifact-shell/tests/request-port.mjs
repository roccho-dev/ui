import assert from "node:assert/strict";
import { observeArtifactRequestElement } from "../src/request-port.mjs";

let assertions = 0;
const deepEqual = (...args) => { assert.deepEqual(...args); assertions += 1; };

const requestA = Object.freeze({ schema: "artifact-invocation/2", id: "a", inputs: Object.freeze([]) });
const requestB = Object.freeze({ schema: "artifact-invocation/2", id: "b", inputs: Object.freeze([]) });
const element = { value: "" };
const observed = observeArtifactRequestElement(element);

observed.element.value = JSON.stringify(requestA);
deepEqual(observed.query(), requestA);

element.value = JSON.stringify(requestB);
deepEqual(observed.query(), requestA);

observed.element.value = JSON.stringify(requestB);
deepEqual(observed.query(), requestB);

const snapshot = observed.query();
snapshot.id = "mutated-copy";
deepEqual(observed.query(), requestB);

console.log(JSON.stringify({
  schema: "check-receipt/1",
  checkId: "ui.artifact-shell.request-port",
  ownerRepo: "ui",
  lane: "repo",
  kind: "normal",
  status: "PASS",
  assertions,
}));
