import { mountGraphEditor, normalizeDocument } from './src/index.mjs';

export const mountFeature = async ({ input, root }) => {
  let documentValue = normalizeDocument(input);
  let revision = 1;
  let etag = `local-${revision}`;

  const load = async () => Object.freeze({ document: documentValue, etag });
  const save = async ({ document, etag: expected }) => {
    if (expected !== etag) throw new Error('stale');
    documentValue = normalizeDocument(document);
    revision += 1;
    etag = `local-${revision}`;
    return Object.freeze({ document: documentValue, etag });
  };

  const mounted = mountGraphEditor(root, {
    labels: {
      heading: 'Graph editor',
      scope: 'UI example',
      canvasLabel: 'Editable graph canvas',
      activeCells: 'Active frame cells',
    },
    load,
    save,
  });

  return Object.freeze({ destroy: mounted.destroy, schema: 'ui-graph-editor-runtime/1' });
};
