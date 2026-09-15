const invariant = (condition, message) => { if (!condition) throw new Error(`artifact-request-port: ${message}`); };
const copyJson = value => value === null ? null : JSON.parse(JSON.stringify(value));

export const observeArtifactRequestElement = element => {
  invariant(element && typeof element === "object", "element is required");
  let reflectedRequest = null;
  const observed = Object.freeze({
    get value() { return element.value; },
    set value(value) {
      element.value = value;
      reflectedRequest = JSON.parse(value);
    },
  });
  return Object.freeze({
    element: observed,
    query: () => copyJson(reflectedRequest),
  });
};
