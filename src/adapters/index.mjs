export function makeAdapterBox({ id, adapterKind, accepts, produces, assets = [] }) {
  if (!id) throw new Error("adapter box id is required");
  if (!adapterKind) throw new Error("adapterKind is required");
  return {
    kind: "ui.adapter.box.v1",
    id,
    adapterKind,
    accepts,
    produces,
    assets,
    ownsState: false,
    note: "descriptor only; renderer host owns execution",
  };
}

export const htmlBox = makeAdapterBox({
  id: "adapter.html.box",
  adapterKind: "html",
  accepts: "need_zoom.voronoi_surface.v1",
  produces: "html.document.fragment",
  assets: ["index.html"],
});

export const cssBox = makeAdapterBox({
  id: "adapter.css.box",
  adapterKind: "css",
  accepts: "need_zoom.voronoi_surface.v1",
  produces: "css.asset",
  assets: ["style.css"],
});

export const jsBox = makeAdapterBox({
  id: "adapter.js.box",
  adapterKind: "js",
  accepts: "need_zoom.voronoi_surface.v1",
  produces: "js.asset",
  assets: ["view.js"],
});
