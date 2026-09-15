import { resolvePreviewCases } from './resolve-cases.mjs';

const cases = await resolvePreviewCases();

export default {
  define: {
    __UI_PREVIEW_CASES__: JSON.stringify(cases),
  },
};
