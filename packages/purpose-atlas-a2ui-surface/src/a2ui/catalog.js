import {Catalog} from '@a2ui/web_core/v0_9';
import {ATLAS_CATALOG_ID} from './apis.js';
import {AtlasShell} from '../components/atlas-shell.js';
import {AtlasHeader} from '../components/atlas-header.js';
import {AtlasToolbar} from '../components/atlas-toolbar.js';
import {AtlasCanvas} from '../components/atlas-canvas.js';
import {AtlasInspector} from '../components/atlas-inspector.js';
import {AtlasToast} from '../components/atlas-toast.js';

export {ATLAS_CATALOG_ID};

export const atlasCatalog = new Catalog(ATLAS_CATALOG_ID, [
  AtlasShell,
  AtlasHeader,
  AtlasToolbar,
  AtlasCanvas,
  AtlasInspector,
  AtlasToast,
]);
