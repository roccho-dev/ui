import { SemanticDomainStore as BaseSemanticDomainStore } from './domain-store.js';
import { normalizeOperation } from './authoring-operation.js';

function invariant(condition, message) {
  if (!condition) throw new Error(`semantic-domain: ${message}`);
}

export class SemanticDomainStore extends BaseSemanticDomainStore {
  execute(input) {
    if (input?.type !== 'ReconnectRelation') return super.execute(input);
    const operation = normalizeOperation(input);
    const relation = this.relations.get(operation.relationId);
    invariant(relation, `ReconnectRelation relation not found: ${operation.relationId}`);
    invariant(this.regions.has(operation.from), `ReconnectRelation source not found: ${operation.from}`);
    invariant(this.regions.has(operation.to), `ReconnectRelation target not found: ${operation.to}`);
    invariant(operation.from !== operation.to, 'self relation is not allowed');
    const duplicate = [...this.relations.values()].some(
      (candidate) => candidate.id !== operation.relationId
        && candidate.from === operation.from
        && candidate.to === operation.to
        && candidate.kind === relation.kind,
    );
    invariant(!duplicate, 'same directed relation already exists');
    relation.from = operation.from;
    relation.to = operation.to;
    return {
      operation,
      result: {
        relationIds: [operation.relationId],
        reconnectedRelationId: operation.relationId,
      },
    };
  }

  fork() {
    return new SemanticDomainStore(this.domain);
  }
}
