import assert from "node:assert/strict";
import { UI_IR_KIND, createUiIr, validateUiIr } from "../src/index.mjs";

const ir = createUiIr({
  capability: "a2ui-browser",
  payloadKind: "a2ui.message.batch",
  payload: [{ type: "Text", props: { text: "hello" } }],
});

assert.equal(ir.kind, UI_IR_KIND);
assert.equal(ir.capability, "a2ui-browser");
assert.equal(validateUiIr(ir), ir);
assert(Object.isFrozen(ir));

for (const invalid of [
  null,
  {},
  { kind: "wrong", capability: "a", payloadKind: "b", payload: {} },
  { kind: UI_IR_KIND, capability: "", payloadKind: "b", payload: {} },
  { kind: UI_IR_KIND, capability: "a", payloadKind: "", payload: {} },
  { kind: UI_IR_KIND, capability: "a", payloadKind: "b", payload: undefined },
  { kind: UI_IR_KIND, capability: "a", payloadKind: "b", payload: {}, extra: true },
]) {
  assert.throws(() => validateUiIr(invalid));
}

const cyclic = {};
cyclic.self = cyclic;
assert.throws(
  () => validateUiIr({ kind: UI_IR_KIND, capability: "a", payloadKind: "b", payload: cyclic }),
  /cycles/,
);

console.log("ui-ir-tests-pass 11");
