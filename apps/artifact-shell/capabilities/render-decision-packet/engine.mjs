export const capability = Object.freeze({
  id: 'render.decision-packet',
  version: '1',
  async run({ input, invocation, services }) {
    const subject = invocation.inputs[0];
    try {
      const packet = input.readJson(subject.id);
      const receipt = await services['ui.package.execute']({
        packageId: 'decision-packet',
        input: Object.freeze({ packet }),
        invocation,
      });
      return Object.freeze({
        diagnostics: Object.freeze([]),
        outputs: Object.freeze([{ contract: 'decision-packet-render-receipt/1', value: receipt }]),
        status: 'PASS',
      });
    } catch (error) {
      return Object.freeze({
        diagnostics: Object.freeze([{ code: 'render.decision-packet.invalid', inputId: subject.id, message: String(error?.message ?? error), severity: 'error' }]),
        outputs: Object.freeze([]),
        status: 'FAIL',
      });
    }
  },
});
