import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  build: {
    sourcemap: true,
    target: 'es2022',
  },
  server: {
    host: '0.0.0.0',
    fs: {
      allow: [root, resolve(root, '../..')],
    },
  },
});
