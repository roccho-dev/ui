import { createMaxGraphAdapter } from '../adapter.js';
import { mountActiveList } from './active-list.js';

export const createSemanticAuthoring = container => {
  const adapter = createMaxGraphAdapter(container);
  const host = container.parentElement;
  const activeList = host ? mountActiveList({
    host,
    onActivate: item => {
      if (item.kind === 'region') adapter.setSelection({ regionIds: [item.id], relationIds: [] });
      else adapter.setSelection({ regionIds: [], relationIds: [item.id] });
    },
  }) : null;

  const rawRender = adapter.render.bind(adapter);
  adapter.render = scene => {
    const result = rawRender(scene);
    activeList?.render(scene);
    activeList?.setSelection(adapter.selectionSnapshot());
    return result;
  };
  adapter.onSelectionChange(selection => activeList?.setSelection(selection));
  Object.defineProperty(adapter, 'activeList', { value: activeList, enumerable: true });
  return adapter;
};

export { createDocumentAuthoring } from './document.js';
export { mountActiveList } from './active-list.js';
