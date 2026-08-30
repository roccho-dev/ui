export const capability = Object.freeze({
  id: "render.semantic-map",
  version: "1",
  async run({ input, invocation, services }) {
    const subject = invocation.inputs[0];
    try {
      const envelope = input.readJson(subject.id);
      const receipt = await services["ui.package.execute"]({
        packageId: "semantic-map",
        input: Object.freeze({ envelope }),
        invocation,
      });
      return Object.freeze({
        diagnostics: Object.freeze([]),
        outputs: Object.freeze([{ contract: "semantic-map-render-receipt/1", value: receipt }]),
        status: "PASS",
      });
    } catch (error) {
      return Object.freeze({
        diagnostics: Object.freeze([{ code: "render.semantic-map.invalid", inputId: subject.id, message: String(error?.message ?? error), severity: "error" }]),
        outputs: Object.freeze([]),
        status: "FAIL",
      });
    }
  },
});
