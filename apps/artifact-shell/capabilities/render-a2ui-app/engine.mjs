const plain = value => value !== null
  && typeof value === "object"
  && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const invariant = (condition, message) => { if (!condition) throw new Error(message); };
const exactKeys = (value, required, optional, name) => {
  invariant(plain(value), `${name} must be a plain object`);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) invariant(Object.hasOwn(value, key), `${name}.${key} is required`);
  for (const key of Object.keys(value)) invariant(allowed.has(key), `${name}.${key} is not allowed`);
};

export const capability = Object.freeze({
  id: "render.a2ui.app",
  version: "1",
  async run({ input, invocation, services }) {
    const subject = invocation.inputs[0];
    try {
      const app = input.readJson(subject.id);
      exactKeys(app, ["schema", "state", "surface"], [], "app");
      invariant(app.schema === "a2ui-app/1", "app.schema must be a2ui-app/1");
      invariant(plain(app.state), "app.state must be a plain object");
      exactKeys(app.surface, ["components", "rootId", "surfaceId"], [], "app.surface");
      invariant(Array.isArray(app.surface.components), "app.surface.components must be an array");
      invariant(typeof app.surface.rootId === "string" && app.surface.rootId.length > 0, "app.surface.rootId is invalid");
      invariant(typeof app.surface.surfaceId === "string" && app.surface.surfaceId.length > 0, "app.surface.surfaceId is invalid");
      const rendered = await services["a2ui.render"]({ surface: { ...app.surface, dataModel: app.state } });
      return Object.freeze({
        diagnostics: Object.freeze([]),
        outputs: Object.freeze([{ contract: "a2ui-app-render-receipt/1", value: Object.freeze({ ...rendered, appSchema: app.schema }) }]),
        status: "PASS",
      });
    } catch (error) {
      return Object.freeze({
        diagnostics: Object.freeze([{ code: "render.a2ui.app.invalid", inputId: subject.id, message: String(error.message), severity: "error" }]),
        outputs: Object.freeze([]),
        status: "FAIL",
      });
    }
  },
});
