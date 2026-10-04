import InternalEvent from '../vendor/maxgraph/view/event/InternalEvent.js';

function setNativePinchEnabled(enabled) {
  this.graph.getPlugin('PanningHandler')?.setPinchEnabled(enabled);
}

function setCamera(scale, translateX, translateY) {
  if (this.cameraPreview) this.cancelCameraPreview();
  this.graph.getView().scaleAndTranslate(scale, translateX, translateY);
}

function camera() {
  const view = this.graph.getView();
  return {
    scale: view.scale,
    translateX: view.translate.x,
    translateY: view.translate.y,
  };
}

// Touch gestures transform the already rendered SVG. The semantic camera,
// projection and maxGraph model are committed once when the gesture ends.
function beginCameraPreview() {
  if (this.cameraPreview) return { ...this.cameraPreview.camera };
  this.graph.panGraph(0, 0);
  const canvas = this.graph.getView().getCanvas();
  const camera = this.camera();
  this.cameraPreview = {
    base: { ...camera },
    camera: { ...camera },
    canvas,
    canvasTransform: canvas?.style.transform ?? '',
    canvasTransformBox: canvas?.style.transformBox ?? '',
    canvasTransformOrigin: canvas?.style.transformOrigin ?? '',
    canvasWillChange: canvas?.style.willChange ?? '',
    overlayTransform: this.overlayRoot?.style.transform ?? '',
    overlayTransformBox: this.overlayRoot?.style.transformBox ?? '',
    overlayTransformOrigin: this.overlayRoot?.style.transformOrigin ?? '',
    overlayWillChange: this.overlayRoot?.style.willChange ?? '',
    frame: 0,
  };
  this.container.dataset.cameraPreview = 'true';
  return { ...camera };
}

function previewCamera(scale, translateX, translateY) {
  if (!this.cameraPreview) this.beginCameraPreview();
  this.cameraPreview.camera = { scale, translateX, translateY };
  if (!this.cameraPreview.frame) {
    this.cameraPreview.frame = requestAnimationFrame(() => {
      if (!this.cameraPreview) return;
      this.cameraPreview.frame = 0;
      this.applyCameraPreview();
    });
  }
  return { ...this.cameraPreview.camera };
}

function applyCameraPreview() {
  const preview = this.cameraPreview;
  if (!preview) return;
  const ratio = preview.camera.scale / preview.base.scale;
  const dx = preview.camera.scale * (preview.camera.translateX - preview.base.translateX);
  const dy = preview.camera.scale * (preview.camera.translateY - preview.base.translateY);
  const matrix = `matrix(${ratio}, 0, 0, ${ratio}, ${dx}, ${dy})`;
  for (const node of [preview.canvas, this.overlayRoot]) {
    if (!node) continue;
    node.style.transformBox = 'view-box';
    node.style.transformOrigin = '0 0';
    node.style.willChange = 'transform';
    node.style.transform = matrix;
  }
}

function clearCameraPreview() {
  const preview = this.cameraPreview;
  if (!preview) return null;
  if (preview.frame) cancelAnimationFrame(preview.frame);
  if (preview.canvas) {
    preview.canvas.style.transform = preview.canvasTransform;
    preview.canvas.style.transformBox = preview.canvasTransformBox;
    preview.canvas.style.transformOrigin = preview.canvasTransformOrigin;
    preview.canvas.style.willChange = preview.canvasWillChange;
  }
  if (this.overlayRoot) {
    this.overlayRoot.style.transform = preview.overlayTransform;
    this.overlayRoot.style.transformBox = preview.overlayTransformBox;
    this.overlayRoot.style.transformOrigin = preview.overlayTransformOrigin;
    this.overlayRoot.style.willChange = preview.overlayWillChange;
  }
  delete this.container.dataset.cameraPreview;
  this.cameraPreview = null;
  return { ...preview.camera };
}

function commitCameraPreview() {
  const preview = this.cameraPreview;
  if (!preview) return false;
  const base = preview.base;
  const camera = this.clearCameraPreview();
  const changed = camera.scale !== base.scale
    || camera.translateX !== base.translateX
    || camera.translateY !== base.translateY;
  if (changed) this.setCamera(camera.scale, camera.translateX, camera.translateY);
  return changed;
}

function cancelCameraPreview() {
  return Boolean(this.clearCameraPreview());
}

function cameraPreviewSnapshot() {
  if (!this.cameraPreview) return Object.freeze({ active: false, camera: null });
  return Object.freeze({ active: true, camera: { ...this.cameraPreview.camera } });
}

function viewport() {
  const { scale, translateX, translateY } = this.camera();
  const { clientWidth, clientHeight } = this.graph.getContainer();
  return {
    x: -translateX,
    y: -translateY,
    width: clientWidth / scale,
    height: clientHeight / scale,
  };
}

function onCameraChange(listener) {
  const view = this.graph.getView();
  view.addListener(InternalEvent.SCALE, listener);
  view.addListener(InternalEvent.TRANSLATE, listener);
  view.addListener(InternalEvent.SCALE_AND_TRANSLATE, listener);
}

export const cameraMethods = Object.freeze({
  setNativePinchEnabled,
  setCamera,
  camera,
  beginCameraPreview,
  previewCamera,
  applyCameraPreview,
  clearCameraPreview,
  commitCameraPreview,
  cancelCameraPreview,
  cameraPreviewSnapshot,
  viewport,
  onCameraChange,
});
