const inspection = (value, bytes) => {
  if (Array.isArray(value)) return Object.freeze({ bytes, itemCount: value.length, kind: "array", schema: "json-inspection/1" });
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return Object.freeze({ bytes, itemCount: keys.length, keys, kind: "object", schema: "json-inspection/1" });
  }
  return Object.freeze({ bytes, itemCount: 1, kind: value === null ? "null" : typeof value, schema: "json-inspection/1" });
};

export const capability = Object.freeze({
  id: "inspect.json",
  version: "1",
  async run({ input, invocation }) {
    const subject = invocation.inputs[0];
    try {
      const value = input.readJson(subject.id);
      return Object.freeze({
        diagnostics: Object.freeze([]),
        outputs: Object.freeze([{ contract: "json-inspection/1", value: inspection(value, subject.bytes) }]),
        status: "PASS",
      });
    } catch (error) {
      return Object.freeze({
        diagnostics: Object.freeze([{ code: "inspect.json.invalid", inputId: subject.id, message: String(error.message), severity: "error" }]),
        outputs: Object.freeze([]),
        status: "FAIL",
      });
    }
  },
});
