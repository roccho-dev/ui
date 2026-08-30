import { canonicalClone } from './canonical-json.js';
import { normalizeOperation } from './operation.js';
import { createSemanticMap, recordsToJSONL } from './semantic-map.js';

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-domain: ${message}`);
}

function cloneMeta(meta) {
  const copy = { schema: meta.schema, root: meta.root, title: meta.title };
  if (meta.geoSpec) copy.geoSpec = canonicalClone(meta.geoSpec);
  return copy;
}

function geographicRegionIds(meta) {
  return new Set((meta.geoSpec?.features ?? []).map((feature) => feature.id));
}

function cloneBounds(bounds) {
  return {
    x: Number(bounds.x),
    y: Number(bounds.y),
    width: Number(bounds.width),
    height: Number(bounds.height),
  };
}

function boundsArray(bounds) {
  return [bounds.x, bounds.y, bounds.width, bounds.height];
}

function cloneTemporal(temporal) {
  if (!temporal) return null;
  const copy = { actor: temporal.actor };
  if (temporal.ordinal) copy.ordinal = { ...temporal.ordinal };
  if (temporal.calendar) copy.calendar = { ...temporal.calendar };
  return copy;
}

function cloneRegion(region) {
  const copy = {
    id: region.id,
    parent: region.parent,
    label: region.label,
    kind: region.kind,
    summary: region.summary,
    bounds: cloneBounds(region.bounds),
  };
  if (Object.hasOwn(region, 'order')) copy.order = region.order;
  if (Object.hasOwn(region, 'value')) copy.value = region.value;
  if (region.temporal) copy.temporal = cloneTemporal(region.temporal);
  if (region.href) copy.href = region.href;
  if (region.mount) copy.mount = { src: region.mount.src };
  if (region.set) copy.set = { complete: region.set.complete };
  if (region.image) copy.image = { ...region.image };
  return copy;
}

function cloneRelation(relation) {
  return {
    id: relation.id,
    from: relation.from,
    to: relation.to,
    kind: relation.kind,
    label: relation.label,
  };
}

function stableDomain(meta, regionOrder, regions, relationOrder, relations) {
  const records = [{ type: 'meta', ...cloneMeta(meta) }];
  for (const id of regionOrder) {
    const region = regions.get(id);
    invariant(region, `missing region ${id}`);
    const record = {
      type: 'region',
      id: region.id,
      parent: region.parent,
      label: region.label,
      kind: region.kind,
      bounds: boundsArray(region.bounds),
      summary: region.summary,
    };
    if (Object.hasOwn(region, 'order')) record.order = region.order;
    if (Object.hasOwn(region, 'value')) record.value = region.value;
    if (region.temporal) record.temporal = cloneTemporal(region.temporal);
    if (region.href) record.href = region.href;
    if (region.mount) record.mount = { src: region.mount.src };
    if (region.set) record.set = { complete: region.set.complete };
    if (region.image) record.image = { ...region.image };
    records.push(record);
  }
  for (const id of relationOrder) {
    const relation = relations.get(id);
    invariant(relation, `missing relation ${id}`);
    records.push({ type: 'relation', ...cloneRelation(relation) });
  }
  return createSemanticMap(records);
}

function topmostRegionIds(ids, regions) {
  const selected = new Set(ids.filter((id) => regions.has(id)));
  return [...selected].filter((id) => {
    let parent = regions.get(id).parent;
    while (parent !== null) {
      if (selected.has(parent)) return false;
      parent = regions.get(parent)?.parent ?? null;
    }
    return true;
  });
}

export class SemanticDomainStore {
  constructor(initialDomain) {
    this.listeners = new Set();
    this.past = [];
    this.future = [];
    this.loadDomain(initialDomain);
  }

  loadDomain(domain) {
    this.meta = cloneMeta(domain.meta);
    this.regionOrder = [...domain.regions.keys()];
    this.relationOrder = domain.relations.map((relation) => relation.id);
    this.regions = new Map(
      [...domain.regions.entries()].map(([id, region]) => [id, cloneRegion(region)]),
    );
    this.relations = new Map(
      domain.relations.map((relation) => [relation.id, cloneRelation(relation)]),
    );
    this.rebuild();
  }

  get domain() {
    return this._domain;
  }

  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event) {
    for (const listener of this.listeners) {
      try { listener(event); } catch (error) { console.error(error); }
    }
  }

  snapshotState() {
    return {
      meta: cloneMeta(this.meta),
      regionOrder: [...this.regionOrder],
      regions: this.regionOrder.map((id) => cloneRegion(this.regions.get(id))),
      relationOrder: [...this.relationOrder],
      relations: this.relationOrder.map((id) => cloneRelation(this.relations.get(id))),
    };
  }

  restoreState(snapshot) {
    this.meta = cloneMeta(snapshot.meta);
    this.regionOrder = [...snapshot.regionOrder];
    this.regions = new Map(snapshot.regions.map((region) => [region.id, cloneRegion(region)]));
    this.relationOrder = [...snapshot.relationOrder];
    this.relations = new Map(snapshot.relations.map((relation) => [relation.id, cloneRelation(relation)]));
    this.rebuild();
  }

  replaceDomain(domain, { notify = true } = {}) {
    this.loadDomain(domain);
    this.past = [];
    this.future = [];
    if (notify) this.notify(Object.freeze({ kind: 'replace', domain: this.domain }));
  }

  replaceRecords(records, options) {
    this.replaceDomain(createSemanticMap(records), options);
  }

  clearDraft() {
    this.past = [];
    this.future = [];
    this.notify(Object.freeze({ kind: 'draft', domain: this.domain }));
  }

  rebuild() {
    this._domain = stableDomain(
      this.meta,
      this.regionOrder,
      this.regions,
      this.relationOrder,
      this.relations,
    );
  }

  descendants(id) {
    const result = [];
    const pending = [id];
    while (pending.length) {
      const current = pending.pop();
      if (!this.regions.has(current)) continue;
      result.push(current);
      for (const candidate of this.regionOrder) {
        if (this.regions.get(candidate).parent === current) pending.push(candidate);
      }
    }
    return result;
  }

  execute(input) {
    const operation = normalizeOperation(input);
    invariant(operation.type !== 'CreateMap', 'CreateMap is only valid as the first Decision');
    switch (operation.type) {
      case 'MoveRegions': {
        const roots = topmostRegionIds(operation.regionIds, this.regions)
          .filter((id) => id !== this.meta.root);
        invariant(roots.length > 0, 'MoveRegions has no editable regions');
        const affected = new Set();
        for (const root of roots) {
          for (const id of this.descendants(root)) affected.add(id);
        }
        const geographic = geographicRegionIds(this.meta);
        for (const id of affected) {
          invariant(!geographic.has(id), `MoveRegions geographic region is read-only: ${id}`);
          invariant(!this.regions.get(id)?.image, `MoveRegions image region is read-only: ${id}`);
        }
        for (const id of affected) {
          const region = this.regions.get(id);
          region.bounds = {
            ...region.bounds,
            x: region.bounds.x + operation.dx,
            y: region.bounds.y + operation.dy,
          };
        }
        return { operation, result: { regionIds: [...affected] } };
      }

      case 'ResizeRegions': {
        const topmost = new Set(topmostRegionIds(operation.items.map((item) => item.regionId), this.regions));
        const affected = new Set();
        for (const item of operation.items) {
          const id = item.regionId;
          if (!topmost.has(id) || id === this.meta.root) continue;
          const region = this.regions.get(id);
          invariant(region, `ResizeRegions region not found: ${id}`);
          const previous = cloneBounds(region.bounds);
          const next = { x: item.bounds[0], y: item.bounds[1], width: item.bounds[2], height: item.bounds[3] };
          const sx = next.width / previous.width;
          const sy = next.height / previous.height;
          const descendants = this.descendants(id);
          const geographic = geographicRegionIds(this.meta);
          for (const descendantId of descendants) {
            invariant(!geographic.has(descendantId), `ResizeRegions geographic region is read-only: ${descendantId}`);
            invariant(!this.regions.get(descendantId)?.image, `ResizeRegions image region is read-only: ${descendantId}`);
          }
          for (const descendantId of descendants) {
            const descendant = this.regions.get(descendantId);
            if (descendantId === id) {
              descendant.bounds = next;
            } else {
              const current = descendant.bounds;
              descendant.bounds = {
                x: next.x + (current.x - previous.x) * sx,
                y: next.y + (current.y - previous.y) * sy,
                width: Math.max(24, current.width * sx),
                height: Math.max(18, current.height * sy),
              };
            }
            affected.add(descendantId);
          }
        }
        invariant(affected.size > 0, 'ResizeRegions has no editable regions');
        return { operation, result: { regionIds: [...affected] } };
      }

      case 'RenameRegion': {
        const region = this.regions.get(operation.regionId);
        invariant(region, `RenameRegion region not found: ${operation.regionId}`);
        region.label = operation.label;
        return { operation, result: { regionIds: [operation.regionId] } };
      }

      case 'SetRegionOrder': {
        const region = this.regions.get(operation.regionId);
        invariant(region, `SetRegionOrder region not found: ${operation.regionId}`);
        invariant(operation.regionId !== this.meta.root, 'root region must not have an order');
        region.order = operation.order;
        return { operation, result: { regionIds: [operation.regionId] } };
      }


      case 'SetRegionValue': {
        const region = this.regions.get(operation.regionId);
        invariant(region, `SetRegionValue region not found: ${operation.regionId}`);
        invariant(operation.regionId !== this.meta.root, 'root region must not have a value');
        region.value = operation.value;
        return { operation, result: { regionIds: [operation.regionId] } };
      }

      case 'PlaceTemporalRegions': {
        const affected = [];
        for (const item of operation.items) {
          const region = this.regions.get(item.regionId);
          invariant(region, `PlaceTemporalRegions region not found: ${item.regionId}`);
          invariant(item.regionId !== this.meta.root, 'root region must not be temporal');
          invariant(region.kind !== 'actor', `PlaceTemporalRegions actor is not an item: ${item.regionId}`);
          if (item.actor !== null) {
            const actor = this.regions.get(item.actor);
            invariant(actor, `PlaceTemporalRegions actor not found: ${item.actor}`);
            invariant(actor.kind === 'actor', `PlaceTemporalRegions actor must reference kind actor: ${item.actor}`);
          }
          const current = cloneTemporal(region.temporal) ?? { actor: item.actor };
          current.actor = item.actor;
          current[operation.axis] = { start: item.start, end: item.end };
          region.temporal = current;
          affected.push(item.regionId);
        }
        return { operation, result: { regionIds: affected } };
      }

      case 'SetRegionLink': {
        const region = this.regions.get(operation.regionId);
        invariant(region, `SetRegionLink region not found: ${operation.regionId}`);
        invariant(operation.regionId !== this.meta.root, 'root region must not have a link');
        if (operation.href === null) delete region.href;
        else {
          invariant(!region.mount, `SetRegionLink mounted region cannot link: ${operation.regionId}`);
          region.href = operation.href;
        }
        return { operation, result: { regionIds: [operation.regionId] } };
      }

      case 'SetSetCompleteness': {
        const region = this.regions.get(operation.regionId);
        invariant(region, `SetSetCompleteness region not found: ${operation.regionId}`);
        invariant(region.kind === 'set', `SetSetCompleteness region is not a set: ${operation.regionId}`);
        region.set = { complete: operation.complete };
        return { operation, result: { regionIds: [operation.regionId] } };
      }

      case 'AddRegion': {
        invariant(this.regions.has(operation.parentId), `AddRegion parent not found: ${operation.parentId}`);
        invariant(!this.regions.has(operation.regionId), `AddRegion duplicate id: ${operation.regionId}`);
        const region = {
          id: operation.regionId,
          parent: operation.parentId,
          label: operation.label,
          kind: operation.kind,
          summary: operation.summary,
          bounds: {
            x: operation.bounds[0],
            y: operation.bounds[1],
            width: operation.bounds[2],
            height: operation.bounds[3],
          },
        };
        if (Object.hasOwn(operation, 'order')) region.order = operation.order;
        if (Object.hasOwn(operation, 'value')) region.value = operation.value;
        if (operation.temporal) region.temporal = cloneTemporal(operation.temporal);
        if (operation.href) region.href = operation.href;
        if (operation.set) region.set = { complete: operation.set.complete };
        this.regions.set(region.id, region);
        this.regionOrder.push(region.id);
        return { operation, result: { regionIds: [region.id], createdRegionId: region.id } };
      }

      case 'ConnectRegions': {
        invariant(this.regions.has(operation.from), `ConnectRegions source not found: ${operation.from}`);
        invariant(this.regions.has(operation.to), `ConnectRegions target not found: ${operation.to}`);
        invariant(operation.from !== operation.to, 'self relation is not allowed');
        const duplicate = [...this.relations.values()].some(
          (relation) => relation.from === operation.from && relation.to === operation.to && relation.kind === operation.kind,
        );
        invariant(!duplicate, 'same directed relation already exists');
        invariant(!this.relations.has(operation.relationId), `ConnectRegions duplicate id: ${operation.relationId}`);
        const relation = {
          id: operation.relationId,
          from: operation.from,
          to: operation.to,
          kind: operation.kind,
          label: operation.label,
        };
        this.relations.set(relation.id, relation);
        this.relationOrder.push(relation.id);
        return { operation, result: { relationIds: [relation.id], createdRelationId: relation.id } };
      }

      case 'MountRegionModule': {
        const region = this.regions.get(operation.regionId);
        invariant(region, `MountRegionModule region not found: ${operation.regionId}`);
        invariant(operation.regionId !== this.meta.root, 'root region must not mount another map');
        invariant(!region.mount, `MountRegionModule region already mounted: ${operation.regionId}`);
        invariant(!region.href, `MountRegionModule linked region cannot mount: ${operation.regionId}`);
        const hasChildren = this.regionOrder.some((id) => this.regions.get(id).parent === operation.regionId);
        invariant(!hasChildren, `MountRegionModule region must be a leaf: ${operation.regionId}`);
        region.mount = { src: operation.src };
        return { operation, result: { regionIds: [operation.regionId] } };
      }

      case 'UnmountRegionModule': {
        const region = this.regions.get(operation.regionId);
        invariant(region, `UnmountRegionModule region not found: ${operation.regionId}`);
        invariant(region.mount, `UnmountRegionModule region is not mounted: ${operation.regionId}`);
        delete region.mount;
        return { operation, result: { regionIds: [operation.regionId] } };
      }

      case 'RemoveSelection': {
        const roots = topmostRegionIds(operation.regionIds, this.regions)
          .filter((id) => id !== this.meta.root);
        const removedRegions = new Set();
        for (const root of roots) {
          for (const id of this.descendants(root)) removedRegions.add(id);
        }
        const removedRelations = new Set(operation.relationIds.filter((id) => this.relations.has(id)));
        for (const relation of this.relations.values()) {
          if (removedRegions.has(relation.from) || removedRegions.has(relation.to)) removedRelations.add(relation.id);
        }
        invariant(removedRegions.size > 0 || removedRelations.size > 0, 'nothing deletable is selected');
        for (const id of removedRegions) this.regions.delete(id);
        this.regionOrder = this.regionOrder.filter((id) => !removedRegions.has(id));
        for (const id of removedRelations) this.relations.delete(id);
        this.relationOrder = this.relationOrder.filter((id) => !removedRelations.has(id));
        return {
          operation,
          result: { regionIds: [...removedRegions], relationIds: [...removedRelations] },
        };
      }

      default:
        throw new Error(`semantic-domain: unsupported operation ${operation.type}`);
    }
  }

  snapshotSession() {
    return {
      state: this.snapshotState(),
      past: [...this.past],
      future: [...this.future],
    };
  }

  restoreSession(snapshot) {
    this.restoreState(snapshot.state);
    this.past = [...snapshot.past];
    this.future = [...snapshot.future];
  }

  fork() {
    return new SemanticDomainStore(this.domain);
  }

  recordDraft(input) {
    const before = this.snapshotState();
    let executed;
    try {
      executed = this.execute(input);
      this.rebuild();
    } catch (error) {
      this.restoreState(before);
      throw error;
    }
    const after = this.snapshotState();
    const entry = Object.freeze({
      operation: executed.operation,
      before,
      after,
      result: Object.freeze({ ...executed.result }),
    });
    this.past.push(entry);
    this.future = [];
    return entry;
  }

  perform(operation) {
    const entry = this.recordDraft(operation);
    this.notify(Object.freeze({ kind: 'draft', entry, domain: this.domain }));
    return entry.result;
  }

  performBatch(operations, validate = null) {
    invariant(Array.isArray(operations) && operations.length > 0, 'operations must be a non-empty array');
    invariant(validate === null || typeof validate === 'function', 'validate must be a function');
    const session = this.snapshotSession();
    const entries = [];
    try {
      for (const operation of operations) entries.push(this.recordDraft(operation));
      const batch = Object.freeze({
        entries: Object.freeze(entries),
        results: Object.freeze(entries.map((entry) => entry.result)),
      });
      validate?.(this, batch);
      this.notify(Object.freeze({ kind: 'batch', batch, domain: this.domain }));
      return batch;
    } catch (error) {
      this.restoreSession(session);
      throw error;
    }
  }

  undo() {
    const entry = this.past.pop();
    if (!entry) return false;
    this.restoreState(entry.before);
    this.future.push(entry);
    this.notify(Object.freeze({ kind: 'undo', entry, domain: this.domain }));
    return true;
  }

  redo() {
    const entry = this.future.pop();
    if (!entry) return false;
    this.restoreState(entry.after);
    this.past.push(entry);
    this.notify(Object.freeze({ kind: 'redo', entry, domain: this.domain }));
    return true;
  }

  draftSnapshot() {
    return Object.freeze({
      canUndo: this.past.length > 0,
      canRedo: this.future.length > 0,
      applied: this.past.length,
      redo: this.future.length,
      operations: Object.freeze(this.past.map((entry) => entry.operation)),
    });
  }

  toRecords() {
    const records = [{ type: 'meta', ...cloneMeta(this.meta) }];
    for (const id of this.regionOrder) {
      const region = this.regions.get(id);
      const record = {
        type: 'region',
        id: region.id,
        parent: region.parent,
        label: region.label,
        kind: region.kind,
        bounds: boundsArray(region.bounds),
        summary: region.summary,
      };
      if (Object.hasOwn(region, 'order')) record.order = region.order;
      if (Object.hasOwn(region, 'value')) record.value = region.value;
      if (region.temporal) record.temporal = cloneTemporal(region.temporal);
      if (region.href) record.href = region.href;
      if (region.mount) record.mount = { src: region.mount.src };
      if (region.set) record.set = { complete: region.set.complete };
      if (region.image) record.image = { ...region.image };
      records.push(record);
    }
    for (const id of this.relationOrder) records.push({ type: 'relation', ...cloneRelation(this.relations.get(id)) });
    return records;
  }

  toJSONL() {
    return recordsToJSONL(this.toRecords());
  }
}
