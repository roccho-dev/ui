export const capability = Object.freeze({
  id: "render.a2ui",
  version: "1",
  async run({ input, invocation, services }) {
    const subject = invocation.inputs[0];
    try {
      const surface = input.readJson(subject.id);
      const value = await services["a2ui.render"]({ surface });
      return Object.freeze({
        diagnostics: Object.freeze([]),
        outputs: Object.freeze([{ contract: "a2ui-render-receipt/1", value }]),
        status: "PASS",
      });
    } catch (error) {
      return Object.freeze({
        diagnostics: Object.freeze([{ code: "render.a2ui.invalid", inputId: subject.id, message: String(error.message), severity: "error" }]),
        outputs: Object.freeze([]),
        status: "FAIL",
      });
    }
  },
});
