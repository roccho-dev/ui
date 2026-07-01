export class GeoMapPort {
  constructor(host, options = {}) {
    if (!host) throw new Error('GeoMapPort host is required');
    this.host = host;
    this.L = options.L || globalThis.L;
    this.tileUrl = options.tileUrl || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    this.map = null;
    this.layers = null;
  }

  mount() {
    if (this.map) return this;
    if (!this.L) throw new Error('Leaflet is required inside GeoMapPort');
    this.host.setAttribute('data-geomap-port', 'leaflet');
    this.host.setAttribute('data-geomap-provider', 'leaflet-osm');
    this.host.setAttribute('data-geomap-mounted', 'true');
    this.host.setAttribute('data-geomap-fallback-used', 'false');
    this.host.removeAttribute?.('data-geomap-disposed');
    this.map = this.L.map(this.host, {zoomControl: true, scrollWheelZoom: true, tap: true});
    const tile = this.L.tileLayer(this.tileUrl, {maxZoom: 19, attribution: 'OpenStreetMap'}).addTo(this.map);
    if (tile?.on) {
      tile.on('tileload', () => this.host.setAttribute('data-geomap-tile-loaded', 'true'));
      tile.on('load', () => this.host.setAttribute('data-geomap-tile-loaded', 'true'));
    }
    this.layers = {
      properties: this.createLayerGroup('properties'),
      poi: this.createLayerGroup('poi'),
      overlay: this.createLayerGroup('overlay'),
    };
    return this;
  }

  createLayerGroup(name) {
    const group = this.L.layerGroup(name);
    group.name = name;
    return group.addTo(this.map);
  }

  update({properties = [], selection = null, poiKeys = [], onSelect = null} = {}) {
    this.mount();
    for (const layer of Object.values(this.layers)) layer.clearLayers();
    const selectedId = selection?.propertyId || null;
    const coords = [];
    const counts = {properties: 0, poi: 0, radius: 0, links: 0};
    for (const property of properties) {
      const lat = Number(property.geo?.lat);
      const lng = Number(property.geo?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      coords.push([lat, lng]);
      const selected = property.id === selectedId;
      const marker = this.L.marker([lat, lng], {
        kind: 'property',
        id: property.id,
        title: property.name,
        rank: property.rank,
        rent_yen: property.rent_yen,
        area_sqm: property.area_sqm,
        address: property.address,
        selected,
        className: `property-marker${selected ? ' selected' : ''}`,
        icon: this.propertyIcon(property, selected),
      }).addTo(this.layers.properties);
      counts.properties += 1;
      marker.on('click', () => onSelect?.(property.id));
      if (selected) {
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
    const center = [Number(property.geo.lat), Number(property.geo.lng)];
    const counts = {poi: 0, radius: 0, links: 0};
    this.L.circle(center, {radius: 8000, className: 'dom-radius'}).addTo(this.layers.overlay);
    counts.radius += 1;
    for (const key of keys) {
      const poi = property.nearby?.[key];
      const lat = Number(poi?.lat);
      const lng = Number(poi?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      this.L.marker([lat, lng], {kind: 'poi', id: key, title: poi.name || poi.label || key, className: 'dom-poi', icon: this.poiIcon(key, poi)}).addTo(this.layers.poi);
      counts.poi += 1;
      this.L.polyline([center, [lat, lng]], {className: 'dom-link'}).addTo(this.layers.overlay);
      counts.links += 1;
    }
    return counts;
  }

  propertyIcon(property, selected) {
    const className = `property-marker${selected ? ' selected' : ''}`;
    const html = `<span class="property-core" aria-hidden="true">&#x1f3e0;</span><span class="map-label"><span class="map-label-name">${escapeHtml(property.name)}</span><small>${formatRent(property.rent_yen)}</small></span>`;
    return this.L.divIcon({className, html, iconSize: null});
  }

  poiIcon(key, poi) {
    const label = poi?.label || poi?.name || key;
    return this.L.divIcon({className: 'dom-poi', html: `<span class="dom-poi-label">${escapeHtml(label)}</span>`, iconSize: null});
  }

  dispose() {
    this.map?.remove?.();
    this.map = null;
    this.layers = null;
    this.host.removeAttribute?.('data-geomap-mounted');
    this.host.setAttribute('data-geomap-disposed', 'true');
    return this;
  }
}

function formatRent(value) {
  const rent = Number(value);
  return Number.isFinite(rent) ? `${rent.toLocaleString('ja-JP')}円` : '';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (char) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[char]));
}
