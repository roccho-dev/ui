import { createDataTransport } from '../../url-module/src/data-transport.mjs';

globalThis.semanticMapDataTransport = createDataTransport(globalThis);
await import('./entry.js');
