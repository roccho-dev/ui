import assert from "node:assert/strict";
import { createArtifactShellWebMcpTools, registerArtifactShellWebMcp } from "../src/webmcp.mjs";

let assertions = 0;
const equal = (...args) => { assert.equal(...args); assertions += 1; };
const deepEqual = (...args) => { assert.deepEqual(...args); assertions += 1; };

const request = Object.freeze({ schema: "artifact-invocation/2", intent: "render" });
const action = Object.freeze({ action: "artifact.state.patch", context: Object.freeze({ schema: "artifact-state-action/1" }) });
const calls = [];
const shell = Object.freeze({
  snapshot: () => Object.freeze({ schema: "artifact-shell-snapshot/1", request }),
  execute: async value => { calls.push(["execute", value]); return Object.freeze({ result: Object.freeze({ status: "PASS" }) }); },
  applyAction: async value => { calls.push(["applyAction", value]); return Object.freeze({ schema: "artifact-shell-action-commit/1" }); },
});

const tools = createArtifactShellWebMcpTools(shell);
deepEqual(tools.map(tool => tool.name), ["artifact_query", "artifact_render", "artifact_apply_action"]);
equal(tools[0].annotations.readOnlyHint, true);
deepEqual(await tools[0].execute({}), { schema: "artifact-shell-snapshot/1", request });
await tools[1].execute({ request });
await tools[2].execute({ detail: action });
deepEqual(calls, [["execute", request], ["applyAction", action]]);

const registrations = [];
const document = Object.freeze({
  modelContext: Object.freeze({
    async registerTool(tool, options) { registrations.push(Object.freeze({ tool, signal: options.signal })); },
  }),
});
const registered = await registerArtifactShellWebMcp({ document, shell });
equal(registered.available, true);
deepEqual(registered.tools, ["artifact_query", "artifact_render", "artifact_apply_action"]);
equal(registrations.length, 3);
equal(registrations.every(item => item.signal.aborted === false), true);
registered.dispose();
equal(registrations.every(item => item.signal.aborted === true), true);

const unavailable = await registerArtifactShellWebMcp({ document: {}, shell });
equal(unavailable.available, false);

console.log(JSON.stringify({
  schema: "check-receipt/1",
  checkId: "ui.artifact-shell.webmcp",
  ownerRepo: "ui",
  lane: "repo",
  kind: "normal",
  status: "PASS",
  assertions,
}));
