export const bootArtifactAdapter = async ({ scope = globalThis } = {}) => {
  const document = scope.document;
  const mount = document.querySelector("#adapter");
  const status = document.querySelector("#status");
  if (!mount || !status) throw new Error("artifact-adapter: mount/status required");

  const get = async href => {
    const response = await scope.fetch(new URL(href, scope.location.href), { cache: "no-store", credentials: "omit" });
    if (!response.ok) throw new Error(`artifact-adapter: ${href} returned ${response.status}`);
    return response;
  };
  const wait = async (predicate, label, timeout = 15_000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (predicate()) return;
      await new Promise(resolve => scope.setTimeout(resolve, 50));
    }
    throw new Error(`artifact-adapter: timed out waiting for ${label}`);
  };
  const pass = detail => {
    document.body.dataset.adapterStatus = "pass";
    status.textContent = "PASS";
    scope.artifactAdapterProof = Object.freeze({ adapter, detail, status: "PASS" });
  };
  const fail = error => {
    document.body.dataset.adapterStatus = "fail";
    status.textContent = `FAIL · ${error.message}`;
    scope.artifactAdapterProof = Object.freeze({ adapter: null, error: String(error.message), status: "FAIL" });
  };
  const frame = href => {
    const iframe = document.createElement("iframe");
    iframe.src = href;
    iframe.title = adapter.label;
    iframe.dataset.adapterFrame = adapter.id;
    mount.replaceChildren(iframe);
    return iframe;
  };
  const frameLoaded = iframe => new Promise((resolve, reject) => {
    iframe.addEventListener("load", resolve, { once: true });
    iframe.addEventListener("error", () => reject(new Error(`artifact-adapter: ${adapter.id} frame failed`)), { once: true });
  });
  const visible = element => {
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };

  let adapter;
  try {
    adapter = await (await get("./adapter.json")).json();
    document.title = `${adapter.label} · UI`;
    document.querySelector("#label").textContent = adapter.label;

    if (adapter.kind === "shell") {
      const catalog = await (await get("../../catalog.json")).json();
      const list = document.createElement("ul");
      for (const entry of catalog.capabilities) {
        const item = document.createElement("li");
        item.textContent = `${entry.capability.id}@${entry.capability.version}`;
        list.append(item);
      }
      mount.replaceChildren(list);
      await wait(() => visible(list) && list.children.length > 0, "shell catalog");
      pass({ capabilities: list.children.length });
      return;
    }

    if (adapter.kind === "invocation") {
      const iframe = frame(adapter.href);
      await frameLoaded(iframe);
      await wait(() => iframe.contentWindow?.artifactShellProof?.outcome?.result?.status === "PASS", `${adapter.id} invocation`);
      if (!visible(iframe)) throw new Error(`artifact-adapter: ${adapter.id} frame is not visible`);
      pass({ href: iframe.src, result: "PASS" });
      return;
    }

    if (adapter.kind === "external") {
      const panel = document.createElement("p");
      const link = document.createElement("a");
      link.href = adapter.href;
      link.rel = "noopener noreferrer";
      link.target = "_blank";
      link.textContent = `open ${adapter.label}`;
      panel.append(link);
      mount.replaceChildren(panel);
      await wait(() => visible(panel) && visible(link), `${adapter.id} handoff`);
      pass({ href: link.href, handoff: true });
      return;
    }

    if (adapter.kind === "reference") {
      const [template, moduleSource, css] = await Promise.all([
        get(adapter.source.html).then(response => response.text()),
        get(adapter.source.module).then(response => response.text()),
        adapter.source.css ? get(adapter.source.css).then(response => response.text()) : Promise.resolve(""),
      ]);
      const config = adapter.view === "control"
        ? {
            endpoints: { control: new URL("../../references/control.jsonl", scope.location.href).href },
            labels: { delete: "delete", heading: "Control reference", saved: "Saved", stale: "Stale", title: "Control reference" },
            view: "control",
          }
        : {
            endpoints: { document: new URL("../../references/document.json", scope.location.href).href },
            labels: { documentName: "Reference document", editor: { heading: "Graph reference" }, stale: "Stale", title: "Graph reference" },
            view: "graph",
          };
      const blob = scope.URL.createObjectURL(new Blob([moduleSource], { type: "text/javascript" }));
      const configText = JSON.stringify(config).replaceAll("<", "\\u003c");
      const bootstrap = `<script id="policy-app-config" type="application/json">${configText}</script><script type="module" src="${blob}"></script>`;
      const styled = adapter.source.css ? template.replace("<!--POLICY_APP_STYLE-->", `<style>${css}</style>`) : template;
      const iframe = document.createElement("iframe");
      iframe.title = adapter.label;
      iframe.dataset.adapterFrame = adapter.id;
      iframe.srcdoc = styled.replace("<!--POLICY_APP_BOOTSTRAP-->", bootstrap);
      mount.replaceChildren(iframe);
      await frameLoaded(iframe);
      await wait(() => {
        const child = iframe.contentDocument;
        return adapter.view === "control"
          ? Boolean(child?.querySelector("#tree .node"))
          : Boolean(child?.querySelector(".roccho-graph-editor")) && !child?.querySelector(".roccho-graph-editor__status--error");
      }, `${adapter.id} reference`);
      if (!visible(iframe)) throw new Error(`artifact-adapter: ${adapter.id} frame is not visible`);
      scope.URL.revokeObjectURL(blob);
      pass({ commit: adapter.source.commit, rendered: true });
      return;
    }

    throw new Error(`artifact-adapter: unsupported kind ${adapter.kind}`);
  } catch (error) {
    fail(error);
  }
};

if (globalThis.location?.protocol === "http:" || globalThis.location?.protocol === "https:") {
  bootArtifactAdapter();
}
