// src/control-graph.mjs
var invalid = (message) => Object.assign(new Error(message), { code: "INVALID_CONTROL" });
var requireControl = (condition, message) => {
  if (!condition) throw invalid(message);
};
var scanLines = (text) => {
  const lines = [];
  let start = 0;
  for (let index = 0; index < text.length; ) {
    if (text[index] !== "\r" && text[index] !== "\n") {
      index += 1;
      continue;
    }
    const delimiter = text[index] === "\r" && text[index + 1] === "\n" ? "\r\n" : text[index];
    lines.push({ body: text.slice(start, index), start, bodyEnd: index, end: index + delimiter.length, delimiter });
    index += delimiter.length;
    start = index;
  }
  lines.push({ body: text.slice(start), start, bodyEnd: text.length, end: text.length, delimiter: "" });
  return lines;
};
var parseControl = (text) => scanLines(text).flatMap((sourceLine, index) => {
  if (!sourceLine.body.trim()) return [];
  let value;
  try {
    value = JSON.parse(sourceLine.body);
  } catch (error) {
    throw invalid(`L${index + 1}: ${error.message}`);
  }
  requireControl(value && !Array.isArray(value) && typeof value === "object", `L${index + 1}: object required`);
  requireControl(typeof value.id === "string" && value.id, `L${index + 1}: id required`);
  requireControl(!Object.hasOwn(value, "parent"), `L${index + 1}: legacy parent prohibited`);
  requireControl(Object.hasOwn(value, "rel"), `L${index + 1}: rel required`);
  requireControl(value.rel === null || value.rel && !Array.isArray(value.rel) && typeof value.rel === "object", `L${index + 1}: invalid rel`);
  requireControl(value.rel === null || !Object.hasOwn(value.rel, "child"), `L${index + 1}: rel.child prohibited`);
  requireControl(value.rel === null || typeof value.rel.parent === "string" && value.rel.parent, `L${index + 1}: rel.parent required`);
  requireControl(value.rel === null || typeof value.rel.kind === "string" && value.rel.kind, `L${index + 1}: rel.kind required`);
  Object.defineProperties(value, { line: { value: index + 1 }, sourceLine: { value: sourceLine } });
  return [value];
});
var connectControl = (records) => {
  requireControl(records.length > 0, "empty JSONL");
  const byId = /* @__PURE__ */ new Map();
  const children = /* @__PURE__ */ new Map();
  for (const record of records) {
    requireControl(!byId.has(record.id), `L${record.line}: duplicate id ${record.id}`);
    byId.set(record.id, record);
    children.set(record.id, []);
  }
  const roots = [];
  for (const record of records) {
    if (record.rel === null) roots.push(record);
    else {
      requireControl(record.rel.parent !== record.id, `L${record.line}: self parent ${record.id}`);
      const parent = byId.get(record.rel.parent);
      requireControl(parent, `L${record.line}: missing parent ${record.rel.parent}`);
      requireControl(record.state !== "active" || parent.state === "active", `L${record.line}: active parent required`);
      children.get(record.rel.parent).push(record);
    }
  }
  for (const record of records) requireControl(record.state !== "active" || record.rel?.kind !== "details" || children.get(record.id).length === 0, `L${record.line}: active details must be leaf`);
  requireControl(roots.length === 1, `exactly one root required; found ${roots.length}`);
  const visiting = /* @__PURE__ */ new Set();
  const visited = /* @__PURE__ */ new Set();
  const visit = (record) => {
    requireControl(!visiting.has(record.id), `cycle at ${record.id}`);
    if (visited.has(record.id)) return;
    visiting.add(record.id);
    children.get(record.id).forEach(visit);
    visiting.delete(record.id);
    visited.add(record.id);
  };
  visit(roots[0]);
  requireControl(visited.size === records.length, "orphan or detached cycle");
  const documents = records.filter((record) => record.op === "document" && record.state === "active");
  requireControl(documents.length === 1, `exactly one active document required; found ${documents.length}`);
  requireControl(documents[0] === roots[0], "active document must be root");
  requireControl(documents[0].schema === 3, "root schema 3 required");
  return { root: roots[0], children };
};

// src/control.mjs
var config = JSON.parse(document.querySelector("#policy-app-config").textContent);
if (typeof config.labels?.title !== "string" || !config.labels.title.trim()) throw new Error("config.labels.title required");
document.title = config.labels.title;
var element = (tag, text, className) => {
  const value = document.createElement(tag);
  if (text != null) value.textContent = text;
  if (className) value.className = className;
  return value;
};
var mountIndex = () => {
  const root = document.querySelector("#app");
  root.append(element("h1", config.labels.heading));
  const nav = element("nav");
  config.links.forEach((link) => {
    const anchor = element("a");
    anchor.href = link.href;
    anchor.append(element("b", link.label), element("small", link.detail));
    nav.append(anchor);
  });
  root.append(nav);
};
var mountTask = () => {
  const root = document.querySelector("#app");
  root.append(element("h1", config.labels.heading), element("p", config.labels.message));
  const link = element("a", config.labels.link);
  link.href = config.endpoints.tasks;
  root.append(link);
};
var mountControl = async () => {
  const mount = document.querySelector("#tree"), dialog = document.querySelector("#editor"), input = document.querySelector("#record-editor"), errorOutput = document.querySelector("#editor-error"), status = document.querySelector("#status"), saveButton = document.querySelector("#save");
  let source = "", etag = "", graph, editMode, editRecord, editKey, returnFocus, saving = false, relationSequence = 0;
  const showStatus = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle("error", error);
  };
  const action = (label, handler, disabled = false) => {
    const button = element("button", label);
    button.type = "button";
    button.disabled = disabled;
    button.addEventListener("click", handler);
    return button;
  };
  const property = (record, key, value) => {
    const locked = key === "id", item = element(locked ? "span" : "button", null, "property");
    if (!locked) {
      item.type = "button";
      item.addEventListener("click", () => openEditor("update", record, key, item));
    }
    item.dataset.key = key;
    item.append(element("span", `${key}:`, "property-key"), element("span", typeof value === "string" ? value : JSON.stringify(value), "property-value"));
    return item;
  };
  const setSaving = (value) => {
    saving = value;
    saveButton.disabled = value;
  };
  const render = (record, children) => {
    const nested = children.get(record.id), node = element("section", null, "node"), row = element("div", null, "row"), properties = element("div", null, "properties");
    Object.entries(record).forEach(([key, value]) => properties.append(property(record, key, value)));
    row.append(properties);
    const branches = element("div");
    if (nested.length) {
      const groups = /* @__PURE__ */ new Map();
      nested.forEach((child) => {
        if (!groups.has(child.rel.kind)) groups.set(child.rel.kind, []);
        groups.get(child.rel.kind).push(child);
      });
      const controls = element("div", null, "relation-controls");
      groups.forEach((members, kind) => {
        const branch = element("div", null, "children");
        branch.id = `relation-${++relationSequence}`;
        members.forEach((child) => branch.append(render(child, children)));
        let open = kind !== "details";
        const toggle = action("", () => setOpen(!open));
        const setOpen = (value) => {
          open = value;
          branch.hidden = !open;
          toggle.textContent = `${open ? "\u25BE" : "\u25B8"} ${kind} ${members.length}`;
        };
        setOpen(open);
        controls.append(toggle);
        branches.append(branch);
      });
      row.append(controls);
    }
    const actions = element("div", null, "actions"), create = action("create", (event) => openEditor("create", record, "id", event.currentTarget));
    actions.append(action("delete", () => removeRecord(record), record.rel === null || nested.length > 0), create);
    row.append(actions);
    node.append(row);
    if (nested.length) node.append(branches);
    return node;
  };
  const renderTree = () => {
    relationSequence = 0;
    mount.replaceChildren(render(graph.root, graph.children));
  };
  const read = async () => {
    const response = await fetch(config.endpoints.control, { cache: "no-store" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    etag = response.headers.get("etag");
    if (!etag) throw new Error("ETag required");
    source = await response.text();
    graph = connectControl(parseControl(source));
    renderTree();
  };
  const put = async (candidate2) => {
    connectControl(parseControl(candidate2));
    if (saving) throw new Error("save in progress");
    setSaving(true);
    try {
      const response = await fetch(config.endpoints.control, { method: "PUT", headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "If-Match": etag }, body: candidate2 });
      const body = await response.text();
      if (!response.ok) throw new Error(response.status === 412 ? config.labels.stale : `${response.status}: ${body.trim()}`);
      const result = JSON.parse(body);
      etag = result.etag;
      source = candidate2;
      graph = connectControl(parseControl(source));
      renderTree();
      showStatus(config.labels.saved);
    } finally {
      setSaving(false);
    }
  };
  const openEditor = (mode, record, key, trigger) => {
    if (saving) return;
    editMode = mode;
    editRecord = record;
    editKey = key;
    returnFocus = trigger;
    errorOutput.textContent = "";
    document.querySelector("#editor-title").textContent = `${mode} \xB7 ${record.id} \xB7 ${key}`;
    input.value = JSON.stringify(mode === "update" ? { ...record } : { id: "", rel: { parent: record.id, kind: "" } }, null, 2);
    dialog.showModal();
    input.focus();
  };
  const candidate = () => {
    const value = JSON.parse(input.value);
    if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("object required");
    const line = editRecord.sourceLine, encoded = JSON.stringify(value);
    if (editMode === "update") {
      if (value.id !== editRecord.id || value.rel?.parent !== editRecord.rel?.parent) throw new Error("id and rel.parent are immutable");
      return source.slice(0, line.start) + encoded + source.slice(line.bodyEnd);
    }
    if (value.rel?.parent !== editRecord.id) throw new Error("rel.parent is fixed");
    const delimiter = line.delimiter || scanLines(source).find((item) => item.delimiter)?.delimiter || "\n";
    return source.slice(0, line.end) + (line.delimiter ? encoded + delimiter : delimiter + encoded) + source.slice(line.end);
  };
  const removeRecord = async (record) => {
    if (record.rel === null || graph.children.get(record.id).length || !window.confirm(`${config.labels.delete} ${record.id}?`)) return;
    const line = record.sourceLine;
    try {
      await put(source.slice(0, line.start) + source.slice(line.end));
    } catch (error) {
      showStatus(error.message, true);
    }
  };
  document.querySelector("#cancel").addEventListener("click", () => dialog.close());
  saveButton.addEventListener("click", async () => {
    try {
      await put(candidate());
      dialog.close();
    } catch (error) {
      errorOutput.textContent = error.message;
    }
  });
  dialog.addEventListener("close", () => returnFocus?.focus());
  await read();
};
try {
  if (config.view === "index") mountIndex();
  else if (config.view === "task") mountTask();
  else await mountControl();
} catch (error) {
  document.querySelector("main").replaceChildren(element("pre", error.message, "error"));
}
