export const UI_IR_KIND = "ui.ir.v1";

const EXACT_KEYS = Object.freeze(["capability", "kind", "payload", "payloadKind"]);

const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

const assertNonEmptyString = (value, name) => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
};

const assertJsonValue = (value, path = "payload", seen = new Set()) => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object") throw new TypeError(`${path} must be JSON data`);
  if (seen.has(value)) throw new TypeError(`${path} must not contain cycles`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`, seen));
  } else if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      assertJsonValue(item, `${path}.${key}`, seen);
    }
  } else {
    throw new TypeError(`${path} must be JSON data`);
  }
  seen.delete(value);
};

export const validateUiIr = (value) => {
  if (!isPlainObject(value)) throw new TypeError("ui IR must be an object");
  const keys = Object.keys(value).sort();
  if (keys.length !== EXACT_KEYS.length || keys.some((key, index) => key !== EXACT_KEYS[index])) {
    throw new TypeError(`ui IR keys must be exactly: ${EXACT_KEYS.join(", ")}`);
  }
  if (value.kind !== UI_IR_KIND) throw new TypeError(`kind must be ${UI_IR_KIND}`);
  assertNonEmptyString(value.capability, "capability");
  assertNonEmptyString(value.payloadKind, "payloadKind");
  assertJsonValue(value.payload);
  return value;
};

export const createUiIr = ({ capability, payloadKind, payload }) => {
  const value = { kind: UI_IR_KIND, capability, payloadKind, payload };
  validateUiIr(value);
  return Object.freeze(value);
};
