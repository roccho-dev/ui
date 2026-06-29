export class GeoMapPort {
  constructor(host, options = {}) {
    this.host = host;
    this.L = options.L || globalThis.L;
    this.map = null;
    this.layers = null;
  }

  mount() {
    if (this.map) return;
    if (!this.L) throw new Error('Leaflet global L is required inside GeoMapPort');
    this.host.setAttribute('data-geomap-port', 'leaflet');
    this.map = this.L.map(this.host, {zoomControl: true, scrollWheelZoom: true, tap: true});
    this.L.tileLayer('about:blank', {maxZoom: 19, attribution: 'offline-proof'}).addTo(this.map);
    this.layers = {
      properties: this.L.layerGroup('properties').addTo(this.map),
      poi: this.L.layerGroup('poi').addTo(this.map),
      overlay: this.L.layerGroup('overlay').addTo(this.map),
    };
  }

  update({properties = [], selection = null, poiKeys = [], onSelect = null} = {}) {
    this.mount();
    for (const layer of Object.values(this.layers)) layer.clearLayers();
    const selectedId = selection?.propertyId || null;
    const coords = [];
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
      marker.on('click', () => onSelect?.(property.id));
      if (property.id === selectedId) this.renderNearby(property, poiKeys);
    }
    if (coords.length && this.L.latLngBounds) this.map.fitBounds(this.L.latLngBounds(coords).pad(0.12), {padding: [48, 48], maxZoom: 12});
    this.host.setAttribute('data-proof', 'map-ready');
  }

  renderNearby(property, keys) {
    const center = [Number(property.geo.lat), Number(property.geo.lng)];
    this.L.circle(center, {radius: 8000, className: 'radius'}).addTo(this.layers.overlay);
    for (const key of keys) {
      const poi = property.nearby?.[key];
      const lat = Number(poi?.lat);
      const lng = Number(poi?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      this.L.marker([lat, lng], {kind: 'poi', id: key, title: poi.name || poi.label || key}).addTo(this.layers.poi);
      this.L.polyline([center, [lat, lng]], {className: 'link'}).addTo(this.layers.overlay);
    }
  }

  dispose() {
    this.map?.remove?.();
    this.map = null;
    this.layers = null;
  }
}
