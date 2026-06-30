export class GeoMapPort {
  constructor(host, options = {}) {
    if (!host) throw new Error('GeoMapPort host is required');
    this.host = host;
    this.L = options.L || globalThis.L || createDomMapRuntime();
    this.map = null;
    this.layers = null;
  }

  mount() {
    if (this.map) return this;
    if (!this.L) throw new Error('Leaflet or DOM fallback runtime is required inside GeoMapPort');
    this.host.setAttribute('data-geomap-port', this.L.__domFallback ? 'dom-fallback' : 'leaflet');
    this.host.setAttribute('data-geomap-mounted', 'true');
    this.host.removeAttribute?.('data-geomap-disposed');
    this.map = this.L.map(this.host, {zoomControl: true, scrollWheelZoom: true, tap: true});
    this.L.tileLayer('about:blank', {maxZoom: 19, attribution: 'offline-proof'}).addTo(this.map);
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
      this.L.marker([lat, lng], {
        kind: 'poi',
        id: key,
        title: poi.name || poi.label || key,
        className: 'dom-poi',
        icon: this.poiIcon(key, poi),
      }).addTo(this.layers.poi);
      counts.poi += 1;
      this.L.polyline([center, [lat, lng]], {className: 'dom-link'}).addTo(this.layers.overlay);
      counts.links += 1;
    }
    return counts;
  }

  propertyIcon(property, selected) {
    const className = `property-marker${selected ? ' selected' : ''}`;
    const html = `<span class="property-core" aria-hidden="true">🏠</span><span class="map-label"><span class="map-label-name">${escapeHtml(property.name)}</span><small>${formatRent(property.rent_yen)}</small></span>`;
    if (typeof this.L.divIcon === 'function') return this.L.divIcon({className, html, iconSize: null});
    return {className, html};
  }

  poiIcon(key, poi) {
    const label = poi?.label || poi?.name || key;
    const html = `<span class="dom-poi-label">${escapeHtml(label)}</span>`;
    if (typeof this.L.divIcon === 'function') return this.L.divIcon({className: 'dom-poi', html, iconSize: null});
    return {className: 'dom-poi', html};
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

function createDomMapRuntime() {
  const propertyPositions = [[14, 16], [28, 17], [58, 56], [74, 48], [42, 62], [20, 42], [50, 24], [68, 30], [82, 62], [34, 48]];
  const poiPositions = [[42, 12], [52, 14], [62, 22], [66, 34], [56, 46], [44, 44], [36, 34], [34, 22], [49, 29]];
  const linkAngles = [-80, -55, -25, 5, 35, 70, 120, 160, 200];
  return {
    __domFallback: true,
    map: (host) => ({host, fitBounds() {}, remove() { host.replaceChildren(); }}),
    tileLayer: () => ({addTo() { return this; }}),
    latLngBounds: () => ({pad() { return this; }}),
    layerGroup: () => ({
      name: '',
      nodes: [],
      addTo(map) { this.map = map; return this; },
      clearLayers() { for (const node of this.nodes.splice(0)) node.remove(); },
    }),
    divIcon: (options = {}) => options,
    marker: (latlng, options = {}) => domLayer('marker', latlng, options),
    circle: (latlng, options = {}) => domLayer('circle', latlng, options),
    polyline: (latlng, options = {}) => domLayer('polyline', latlng, options),
  };

  function domLayer(type, latlng, options) {
    return {
      events: {},
      addTo(group) {
        const host = group.map?.host;
        if (!host) return this;
        const node = renderNode(type, group, options);
        node.onclick = (event) => { event.stopPropagation(); this.events.click?.(); };
        host.appendChild(node);
        group.nodes.push(node);
        this.node = node;
        return this;
      },
      on(eventName, callback) { this.events[eventName] = callback; return this; },
    };
  }

  function renderNode(type, group, options) {
    if (type === 'marker' && options.kind === 'property') {
      const pos = propertyPositions[(Number(options.rank || 1) - 1) % propertyPositions.length];
      const node = document.createElement('button');
      node.className = options.icon?.className || options.className || 'property-marker';
      node.style.left = `${pos[0]}%`;
      node.style.top = `${pos[1]}%`;
      node.innerHTML = options.icon?.html || '';
      node.setAttribute('aria-label', `${options.title || 'property'} ${formatRent(options.rent_yen)}`.trim());
      return node;
    }
    if (type === 'marker') {
      const pos = poiPositions[group.nodes.length % poiPositions.length];
      const node = document.createElement('button');
      node.className = options.icon?.className || options.className || 'dom-poi';
      node.style.left = `${pos[0]}%`;
      node.style.top = `${pos[1]}%`;
      node.innerHTML = options.icon?.html || escapeHtml(options.id || 'poi');
      node.setAttribute('aria-label', options.title || options.id || 'poi');
      return node;
    }
    if (type === 'circle') {
      const node = document.createElement('span');
      node.className = options.className || 'dom-radius';
      node.style.left = '50%';
      node.style.top = '30%';
      node.style.width = '180px';
      node.style.height = '180px';
      return node;
    }
    const index = Math.max(0, group.nodes.length - 1) % linkAngles.length;
    const node = document.createElement('span');
    node.className = options.className || 'dom-link';
    node.style.left = '50%';
    node.style.top = '30%';
    node.style.width = '130px';
    node.style.transform = `rotate(${linkAngles[index]}deg)`;
    return node;
  }
}
