import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {packageEndpointInventory, registryDevRoutesPlugin} from './src/registry-dev-routes.js';

const browserEntries = packageEndpointInventory().filter(({renderable}) => renderable)
  .map(({browserEntry}) => fileURLToPath(new URL(`../../../${browserEntry}`, import.meta.url)));

export default defineConfig({
  root: fileURLToPath(new URL('./', import.meta.url)),
  base: '/registry/',
  publicDir: fileURLToPath(new URL('./public/', import.meta.url)),
  appType: 'mpa',
  plugins: [{
    name: 'registry-route-boundary',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
        if (pathname === '/' || pathname === '/purpose-atlas' || pathname.startsWith('/purpose-atlas/')) {
          response.statusCode = 404;
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.end('Not Found');
          return;
        }
        next();
      });
    },
  }, registryDevRoutesPlugin()],
  build: {
    outDir: fileURLToPath(new URL('./dist/', import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      input: [fileURLToPath(new URL('./registry/index.html', import.meta.url)), ...browserEntries],
    },
  },
  server: {
    host: '127.0.0.1',
    strictPort: true,
  },
});
