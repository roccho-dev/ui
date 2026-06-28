import {Catalog} from '@a2ui/web_core/v0_9';
import {ATLAS_CATALOG_ID} from './apis.js';
import {A2uiSduiSurface} from '../components/a2ui-sdui-surface.js';

export {ATLAS_CATALOG_ID};
export const atlasCatalog = new Catalog(ATLAS_CATALOG_ID, [A2uiSduiSurface]);
