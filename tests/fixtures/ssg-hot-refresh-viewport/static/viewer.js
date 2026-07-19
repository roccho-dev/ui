const SVG_NS = "http://www.w3.org/2000/svg";

export async function createProofViewer() {
  const svg = required("#viewer");
  const viewportLayer = required("#viewport-layer");
  const sceneLayer = required("#scene-layer");
  const titleElement = required("#scene-title");
  const subtitleElement = required("#scene-subtitle");
  const scaleElement = required("#scale-value");
  const panElement = required("#pan-value");
  const updateCountElement = required("#update-count");
  const compilerMarkerElement = required("#compiler-marker");
  const pageInstanceElement = required("#page-instance");
  const refreshStateElement = required("#refresh-state");
  const connectionDot = required("#connection-dot");

  const pageInstance = crypto.randomUUID();
  const viewport = { x: 78, y: 72, scale: 0.88 };
  let updateCount = 0;
  let drag;
  let currentData;

  pageInstanceElement.textContent = pageInstance.slice(0, 8);
  document.documentElement.dataset.pageInstance = pageInstance;

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      element.setAttribute(key, String(value));
    }
    return element;
  }

  function applyViewport() {
    viewportLayer.setAttribute(
      "transform",
      `translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`,
    );
    scaleElement.textContent = `${viewport.scale.toFixed(2)}×`;
    panElement.textContent = `${Math.round(viewport.x)}, ${Math.round(viewport.y)}`;
  }

  function getViewport() {
    return { ...viewport };
  }

  function setViewport(next) {
    viewport.x = next.x;
    viewport.y = next.y;
    viewport.scale = next.scale;
    applyViewport();
  }

  function nodeCenter(node) {
    return {
      x: node.x + node.width / 2,
      y: node.y + node.height / 2,
    };
  }

  function renderLink(from, to) {
    const start = nodeCenter(from);
    const end = nodeCenter(to);
    const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
    const x1 = horizontal ? (end.x > start.x ? from.x + from.width : from.x) : start.x;
    const y1 = horizontal ? start.y : (end.y > start.y ? from.y + from.height : from.y);
    const x2 = horizontal ? (end.x > start.x ? to.x - 14 : to.x + to.width + 14) : end.x;
    const y2 = horizontal ? end.y : (end.y > start.y ? to.y - 14 : to.y + to.height + 14);
    const bend = horizontal
      ? Math.max(70, Math.abs(x2 - x1) * 0.42)
      : Math.max(70, Math.abs(y2 - y1) * 0.42);
    const pathData = horizontal
      ? `M ${x1} ${y1} C ${x1 + Math.sign(x2 - x1) * bend} ${y1}, ${x2 - Math.sign(x2 - x1) * bend} ${y2}, ${x2} ${y2}`
      : `M ${x1} ${y1} C ${x1} ${y1 + Math.sign(y2 - y1) * bend}, ${x2} ${y2 - Math.sign(y2 - y1) * bend}, ${x2} ${y2}`;
    return svgElement("path", { d: pathData, class: "link" });
  }

  function renderNode(node) {
    const group = svgElement("g", {
      class: `node ${node.kind || "source"}`,
      "data-node-id": node.id,
    });
    group.append(
      svgElement("rect", {
        x: node.x + 9,
        y: node.y + 11,
        width: node.width,
        height: node.height,
        rx: 22,
        class: "node-shadow",
      }),
      svgElement("rect", {
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        rx: 22,
        class: "node-card",
      }),
    );

    const pill = svgElement("text", {
      x: node.x + 24,
      y: node.y + 31,
      class: "node-pill",
    });
    pill.textContent = (node.kind || "node").toUpperCase();

    const label = svgElement("text", {
      x: node.x + 24,
      y: node.y + 65,
      class: "node-label",
    });
    label.textContent = node.label;

    const body = svgElement("text", {
      x: node.x + 24,
      y: node.y + 96,
      class: "node-body",
    });
    body.textContent = node.body;

    group.append(pill, label, body);
    return group;
  }

  function setData(data) {
    currentData = data;
    const byId = new Map(data.nodes.map((node) => [node.id, node]));
    const fragment = document.createDocumentFragment();

    for (const [fromId, toId] of data.links) {
      const from = byId.get(fromId);
      const to = byId.get(toId);
      if (from && to) fragment.append(renderLink(from, to));
    }
    for (const node of data.nodes) fragment.append(renderNode(node));

    sceneLayer.replaceChildren(fragment);
    titleElement.textContent = data.title;
    subtitleElement.textContent = data.subtitle;
    compilerMarkerElement.textContent = data.compilerMarker;
  }

  async function fetchGeneratedData(revision = "initial") {
    const response = await fetch(`/generated/scene.json?v=${encodeURIComponent(revision)}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`scene fetch failed: ${response.status}`);
    return response.json();
  }

  async function refreshGeneratedOutput(revision) {
    const savedViewport = getViewport();
    const data = await fetchGeneratedData(revision);
    setData(data);
    setViewport(savedViewport);
    updateCount += 1;
    updateCountElement.textContent = String(updateCount);
    refreshStateElement.textContent = `更新 #${updateCount}`;
  }

  function setRefreshState(state) {
    if (state === "ready") {
      connectionDot.classList.add("ready");
      if (updateCount === 0) refreshStateElement.textContent = "監視中";
      return;
    }
    connectionDot.classList.remove("ready");
    refreshStateElement.textContent = "再接続待ち";
  }

  function zoomAt(clientX, clientY, factor) {
    const bounds = svg.getBoundingClientRect();
    const pointX = clientX - bounds.left;
    const pointY = clientY - bounds.top;
    const worldX = (pointX - viewport.x) / viewport.scale;
    const worldY = (pointY - viewport.y) / viewport.scale;
    const nextScale = Math.min(3.5, Math.max(0.35, viewport.scale * factor));

    viewport.x = pointX - worldX * nextScale;
    viewport.y = pointY - worldY * nextScale;
    viewport.scale = nextScale;
    applyViewport();
  }

  svg.addEventListener("wheel", (event) => {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.0015));
  }, { passive: false });

  svg.addEventListener("pointerdown", (event) => {
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      viewportX: viewport.x,
      viewportY: viewport.y,
    };
    svg.setPointerCapture(event.pointerId);
    svg.classList.add("dragging");
  });

  svg.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    viewport.x = drag.viewportX + event.clientX - drag.startX;
    viewport.y = drag.viewportY + event.clientY - drag.startY;
    applyViewport();
  });

  function finishDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = undefined;
    svg.classList.remove("dragging");
  }

  svg.addEventListener("pointerup", finishDrag);
  svg.addEventListener("pointercancel", finishDrag);

  required("#zoom-in").addEventListener("click", () => {
    const bounds = svg.getBoundingClientRect();
    zoomAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, 1.2);
  });

  required("#zoom-out").addEventListener("click", () => {
    const bounds = svg.getBoundingClientRect();
    zoomAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, 1 / 1.2);
  });

  required("#reset").addEventListener("click", () => {
    setViewport({ x: 78, y: 72, scale: 0.88 });
  });

  applyViewport();
  setData(await fetchGeneratedData());

  const api = {
    getViewport,
    setViewport,
    setData,
    getData: () => currentData,
    refreshGeneratedOutput,
    setRefreshState,
  };
  window.viewer = api;
  return api;
}

function required(selector) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`missing required element: ${selector}`);
  return element;
}
