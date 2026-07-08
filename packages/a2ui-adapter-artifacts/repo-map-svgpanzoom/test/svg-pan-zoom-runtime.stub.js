window.svgPanZoom = function svgPanZoomStub() {
  let zoom = 1;
  return {
    getZoom() { return zoom; },
    resize() {},
    fit() { zoom = 1; },
    center() {},
    zoomOut() { zoom = Math.max(1, zoom / 1.2); },
    zoomIn() { zoom *= 1.2; },
  };
};
