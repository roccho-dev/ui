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
    this.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19, attribution: 'OpenStreetMap'}).addTo(this.map);
    this.layers = {
      properties: this.L.layerGroup().addTo(this.map),
      poi: this.L.layerGroup().addTo(this.map),
      overlay: this.L.layerGroup().addTo(this.map),
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
      const selected = property.id === selectedId;
      coords.push([lat, lng]);
      const marker = this.L.marker([lat, lng], {
        icon: this.L.divIcon({
          className: 'geo-property-marker',
          html: this.markerHtml(property, selected),
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
        zIndexOffset: selected ? 900 : 0,
      }).addTo(this.layers.properties);
      marker.on('click', () => onSelect?.(property.id));
      if (selected) this.renderNearby(property, poiKeys);
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
      this.L.marker([lat, lng], {
        icon: this.L.divIcon({className: 'geo-poi-marker', html: this.poiHtml(key, poi), iconSize: [30, 30], iconAnchor: [15, 15]}),
        zIndexOffset: 600,
      }).addTo(this.layers.poi);
      this.L.polyline([center, [lat, lng]], {className: 'link'}).addTo(this.layers.overlay);
    }
  }
  markerHtml(property, selected) {
    return `<div class="geo-marker property" data-property-id="${escapeHtml(property.id)}"><span class="pin property ${selected ? 'selected' : ''}">home</span><span class="label">${escapeHtml(property.name)}<br>${escapeHtml(String(property.rent?.total_monthly_yen || ''))}yen</span></div>`;
  }
  poiHtml(key, poi) {
    return `<div class="geo-marker poi" data-poi-key="${escapeHtml(key)}"><span class="pin poi">poi</span><span class="label">${escapeHtml(poi.label || key)}<br>${escapeHtml(poi.name || '')}</span></div>`;
  }
  dispose() {
    this.map?.remove?.();
    this.map = null;
    this.layers = null;
  }
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
