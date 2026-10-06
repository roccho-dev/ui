// Renderer-independent camera fit math. translateX/Y are the world-space
// translations consumed by adapter.setCamera(scale, translateX, translateY).
export const fitCamera = (world, viewport, margin = 0.98) => {
  const scale = Math.min(viewport.width / world.width, viewport.height / world.height) * margin;
  return Object.freeze({
    scale,
    translateX: (viewport.width / scale - world.width) / 2 - world.x,
    translateY: (viewport.height / scale - world.height) / 2 - world.y,
  });
};
