import { assertExactKeys, assertStringArray, createTrustedCatalog, isPlainObject } from "./runtime.mjs";

export const A2UI_MESSAGE_VERSION = "v0.9";
export const A2UI_SPEC_VERSION = "v0.9.1";
export const BASE_CATALOG_ID = "urn:roccho:a2ui:catalog:base:1";
export const BASE_COMPONENT_NAMES = Object.freeze(["Button", "Card", "Column", "Divider", "Text"]);

const unsafePathSegments = new Set(["__proto__", "constructor", "prototype"]);
const dataPathSegments = path => {
  invariant(typeof path === "string" && path.startsWith("/") && path.length > 1 && path.length <= 512, "Text.path must be a JSON pointer");
  const segments = path.slice(1).split("/").map(segment => {
    invariant(segment.length > 0 && !/~(?:[^01]|$)/u.test(segment), "Text.path is invalid");
    const decoded = segment.replaceAll("~1", "/").replaceAll("~0", "~");
    invariant(!unsafePathSegments.has(decoded), "Text.path is invalid");
    return decoded;
  });
  invariant(segments.length > 0 && segments.length <= 32, "Text.path depth is invalid");
  return segments;
};
const readDataPath = (root, path) => {
  const segments = dataPathSegments(path);
  let value = root;
  for (const segment of segments) {
    invariant(value !== null && typeof value === "object", "Text.path does not resolve");
    const key = Array.isArray(value) && /^(?:0|[1-9][0-9]*)$/u.test(segment) ? Number(segment) : segment;
    invariant(Object.hasOwn(value, key), "Text.path does not resolve");
    value = value[key];
  }
  invariant(value === null || ["boolean", "number", "string"].includes(typeof value), "Text.path must resolve to a scalar");
  invariant(typeof value !== "number" || Number.isFinite(value), "Text.path resolved to a non-finite number");
  return value === null ? "null" : String(value);
};

const invariant = (condition, message) => {
  if (!condition) throw new Error(`a2ui-catalog: ${message}`);
};

const definitions = [
  {
    name: "Text",
    validate: component => {
      assertExactKeys(component, ["component", "id"], ["path", "text", "variant"], "Text");
      invariant(Number(Object.hasOwn(component, "text")) + Number(Object.hasOwn(component, "path")) === 1, "Text requires exactly one of text or path");
      if (Object.hasOwn(component, "text")) invariant(typeof component.text === "string", "Text.text must be a string");
      if (Object.hasOwn(component, "path")) dataPathSegments(component.path);
      if (component.variant !== undefined) invariant(["body", "caption", "h1", "h2"].includes(component.variant), "Text.variant is unsupported");
      return component;
    },
    render: ({ component, dataModel, document }) => {
      const tag = component.variant === "h1" ? "h1" : component.variant === "h2" ? "h2" : component.variant === "caption" ? "small" : "p";
      const element = document.createElement(tag);
      element.textContent = Object.hasOwn(component, "text") ? component.text : readDataPath(dataModel, component.path);
      return element;
    },
  },
  {
    name: "Column",
    validate: component => {
      assertExactKeys(component, ["children", "component", "id"], ["gap"], "Column");
      assertStringArray(component.children, "Column.children");
      if (component.gap !== undefined) invariant(Number.isFinite(component.gap) && component.gap >= 0, "Column.gap must be non-negative");
      return component;
    },
    render: ({ component, document, renderChild }) => {
      const element = document.createElement("div");
      element.setAttribute("data-gap", String(component.gap ?? 0));
      for (const child of component.children) element.append(renderChild(child));
      return element;
    },
  },
  {
    name: "Card",
    validate: component => {
      assertExactKeys(component, ["children", "component", "id"], [], "Card");
      assertStringArray(component.children, "Card.children");
      return component;
    },
    render: ({ component, document, renderChild }) => {
      const element = document.createElement("section");
      for (const child of component.children) element.append(renderChild(child));
      return element;
    },
  },
  {
    name: "Divider",
    validate: component => {
      assertExactKeys(component, ["component", "id"], [], "Divider");
      return component;
    },
    render: ({ document }) => document.createElement("hr"),
  },
  {
    name: "Button",
    validate: component => {
      assertExactKeys(component, ["action", "component", "context", "id", "label"], [], "Button");
      invariant(typeof component.label === "string" && component.label.length > 0, "Button.label is invalid");
      invariant(typeof component.action === "string" && component.action.length > 0, "Button.action is invalid");
      invariant(isPlainObject(component.context), "Button.context must be a plain object");
      return component;
    },
    render: ({ component, document, emitAction }) => {
      const element = document.createElement("button");
      element.type = "button";
      element.textContent = component.label;
      element.addEventListener("click", () => emitAction({ action: component.action, context: component.context }));
      return element;
    },
  },
];

const BASE_CATALOG = createTrustedCatalog({ definitions: [...definitions].sort((left, right) => BASE_COMPONENT_NAMES.indexOf(left.name) - BASE_COMPONENT_NAMES.indexOf(right.name)), id: BASE_CATALOG_ID });

export const createBaseCatalog = () => BASE_CATALOG;
export const validateComponent = value => BASE_CATALOG.validateComponent(value);
