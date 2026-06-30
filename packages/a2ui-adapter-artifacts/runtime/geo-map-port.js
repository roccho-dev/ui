export class GeoMapPort {
  constructor(host, options = {}) {
    if (!host) throw new Error('GeoMapPort host is required');
    this.host = host;
    this.L = options.L || globalThis.L;
    this.tileUrl = options.tileUrl || 'about:blank';
    this.tileOptions = options.tileOptions || {maxZoom: 19, attribution: 'offline-proof'};
    this.map = null;
    this.layers = null;
    this.tileLayer = null;
  }

  mount() {
    if (this.map && this.layers) return this;
    if (!this.L) throw new Error('Leaflet global L is required inside GeoMapPort');
    this.host.setAttribute('data-geomap-port', 'leaflet');
    this.host.setAttribute('data-geomap-mounted', 'true');
    this.host.removeAttribute?.('data-geomap-disposed');
    this.map = this.L.map(this.host, {zoomControl: true, scrollWheelZoom: true, tap: true});
    this.tileLayer = this.L.tileLayer?.(this.tileUrl, this.tileOptions) || null;
    this.tileLayer?.addTo?.(this.map);
    this.layers = {
      properties: this.createLayerGroup('properties'),
      poi: this.createLayerGroup('poi'),
      overlay: this.createLayerGroup('overlay'),
    };
    return this;
  }

  update({properties = [], selection = null, poiKeys = [], onSelect = null} = {}) {
    this.mount();
    this.clearRenderLayers();
    const selectedId = selection?.propertyId || null;
    const coords = [];
    const counts = {properties: 0, poi: 0, radius: 0, links: 0};
    for (const property of properties) {
      const lat = Number(property.geo?.lat);
      const lng = Number(property.geo?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      coords.push([lat, lng]);
      const marker = this.L.marker([lat, lng], {
        kind: 'property',
        id: property.id,
        title: property.name,
        rank: property.rank,
        rent_yen: property.rent_yen,
        area_sqm: property.area_sqm,
        address: property.address,
        selected: property.id === selectedId,
      }).addTo(this.layers.properties);
      counts.properties += 1;
      marker.on?.('click', () => onSelect?.(property.id));
      if (property.id === selectedId) {
        const nearby = this.renderNearby(property, poiKeys);
        counts.poi += nearby.poi;
        counts.radius += nearby.radius;
        counts.links += nearby.links;
      }
    }
    if (coords.length && this.L.latLngBounds) this.map.fitBounds(this.L.latLngBounds(coords).pad(0.12), {padding: [48, 48], maxZoom: 12});
    this.host.setAttribute('data-proof', 'map-ready');
    this.host.setAttribute('data-geomap-property-count', String(counts.properties));
    this.host.setAttribute('data-geomap-poi-count', String(counts.poi));
    this.host.setAttribute('data-geomap-radius-count', String(counts.radius));
    this.host.setAttribute('data-geomap-link-count', String(counts.links));
    return counts;
  }

  renderNearby(property, keys) {
    const lat = Number(property.geo?.lat);
    const lng = Number(property.geo?.lng);
    const counts = {poi: 0, radius: 0, links: 0};
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return counts;
    const center = [lat, lng];
    this.L.circle(center, {radius: 8000, className: 'radius'}).addTo(this.layers.overlay);
    counts.radius += 1;
    for (const key of keys) {
      const poi = property.nearby?.[key];
      const poiLat = Number(poi?.lat);
      const poiLng = Number(poi?.lng);
      if (!Number.isFinite(poiLat) || !Number.isFinite(poiLng)) continue;
      this.L.marker([poiLat, poiLng], {kind: 'poi', id: key, title: poi.name || poi.label || key}).addTo(this.layers.poi);
      this.L.polyline([center, [poiLat, poiLng]], {className: 'link'}).addTo(this.layers.overlay);
      counts.poi += 1;
      counts.links += 1;
    }
    return counts;
  }

  dispose() {
    this.clearRenderLayers();
    this.tileLayer?.remove?.();
    this.map?.off?.();
    this.map?.remove?.();
    this.tileLayer = null;
    this.map = null;
    this.layers = null;
    this.host.removeAttribute?.('data-geomap-mounted');
    this.host.setAttribute('data-geomap-disposed', 'true');
    return this;
  }

  createLayerGroup(name) {
    return this.L.layerGroup(name).addTo(this.map);
  }

  clearRenderLayers() {
    if (!this.layers) return;
    for (const layer of Object.values(this.layers)) this.clearLayer(layer);
  }

  clearLayer(layer) {
    if (!layer) return;
    if (typeof layer.clearLayers === 'function') {
      layer.clearLayers();
      return;
    }
    if (Array.isArray(layer.nodes)) {
      for (const node of layer.nodes) node.remove?.();
      layer.nodes = [];
    }
  }
}
