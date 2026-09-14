import { createMaxGraphAdapter } from '../adapter.js';
import { mountActiveList } from './active-list.js';

const textInput = target => target instanceof HTMLInputElement
  || target instanceof HTMLTextAreaElement
  || target instanceof HTMLSelectElement
  || target?.isContentEditable;

const installRelationReconnect = adapter => {
  const graph = adapter.graph;
  graph.setCellsDisconnectable(true);

  const nativeIsCellDisconnectable = graph.isCellDisconnectable.bind(graph);
  graph.isCellDisconnectable = cell => {
    if (cell?.semantic?.type !== 'relation') return nativeIsCellDisconnectable(cell);
    return cell.semantic.readOnly !== true && cell.semantic.relationIds?.length === 1;
  };

  const nativeConnectCell = graph.connectCell.bind(graph);
  graph.connectCell = (edge, terminal, isSource, constraint) => {
    const semantic = edge?.semantic;
    if (
      adapter.projecting
      || semantic?.type !== 'relation'
      || semantic.readOnly === true
      || semantic.relationIds?.length !== 1
    ) {
      return nativeConnectCell(edge, terminal, isSource, constraint);
    }

    const other = edge.getTerminal(!isSource);
    const source = isSource ? terminal : other;
    const target = isSource ? other : terminal;
    const from = source?.semantic?.regionId;
    const to = target?.semantic?.regionId;
    const connected = nativeConnectCell(edge, terminal, isSource, constraint);
    if (!from || !to) {
      adapter.render(adapter.lastScene);
      return connected;
    }

    const result = adapter.submitOperation({
      type: 'ReconnectRelation',
      relationId: semantic.relationIds[0],
      from,
      to,
    });
    if (!result) adapter.render(adapter.lastScene);
    return connected;
  };
};

export const createSemanticAuthoring = container => {
  const adapter = createMaxGraphAdapter(container);
  installRelationReconnect(adapter);
  const host = container.parentElement;
  const activeList = host ? mountActiveList({
    host,
    onActivate: item => {
      if (item.kind === 'region') adapter.setSelection({ regionIds: [item.id], relationIds: [] });
      else adapter.setSelection({ regionIds: [], relationIds: [item.id] });
    },
  }) : null;

  const nudgeSelection = (dx, dy) => {
    const cells = adapter.graph.getSelectionCells().filter(cell => cell.isVertex()
      && cell.semantic?.type === 'region'
      && !cell.semantic.readOnly
      && cell.semantic.mode !== 'boundary'
      && (cell.semantic.geometryEditable || cell.semantic.temporalEdit));
    if (cells.length === 0) return false;
    adapter.graph.moveCells(cells, dx, dy, false);
    return true;
  };

  const rawRender = adapter.render.bind(adapter);
  adapter.render = scene => {
    const result = rawRender(scene);
    activeList?.render(scene);
    activeList?.setSelection(adapter.selectionSnapshot());
    return result;
  };
  adapter.onSelectionChange(selection => activeList?.setSelection(selection));
  Object.defineProperties(adapter, {
    activeList: { value: activeList, enumerable: true },
    nudgeSelection: { value: nudgeSelection, enumerable: true },
  });

  container.ownerDocument.addEventListener('keydown', event => {
    if (textInput(event.target) || event.altKey || event.ctrlKey || event.metaKey) return;
    const delta = event.shiftKey ? 10 : 1;
    const vector = {
      ArrowLeft: [-delta, 0],
      ArrowRight: [delta, 0],
      ArrowUp: [0, -delta],
      ArrowDown: [0, delta],
    }[event.key];
    if (!vector || !nudgeSelection(...vector)) return;
    event.preventDefault();
  });

  return adapter;
};

export { createDocumentAuthoring } from './document.js';
export { mountActiveList } from './active-list.js';
