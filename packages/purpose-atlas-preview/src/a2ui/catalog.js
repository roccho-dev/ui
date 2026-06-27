import {Catalog} from '@a2ui/web_core/v0_9';
import {ATLAS_CATALOG_ID} from './apis.js';
import {AtlasSourceSurface} from '../components/atlas-source-surface.js';

export {ATLAS_CATALOG_ID};

export const atlasCatalog = new Catalog(ATLAS_CATALOG_ID, [
  AtlasSourceSurface,
]);
