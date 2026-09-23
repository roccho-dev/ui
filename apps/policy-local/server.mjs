import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateSingleFieldEdit } from '../../packages/control/editor.mjs';
import { createFileStore } from './store.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultAssetRoot = path.resolve(here, '../..');
export const MAX_BODY_BYTES = 2 * 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true });

const failure = (status, message) => Object.assign(new Error(message), { status });
const typeFor = file => ({ '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] ?? 'application/octet-stream';
const textType = value => `${value}; charset=utf-8`;

const requestPath = target => {
  const raw = target.split('?')[0];
  if (!raw.startsWith('/')) throw failure(400, 'invalid request target');
  let decoded;
  try { decoded = decodeURIComponent(raw); } catch { throw failure(400, 'invalid URL encoding'); }
  if (decoded.includes('\\') || decoded.includes('\0') || decoded.split('/').some(part => part === '.' || part === '..' || part.startsWith('.'))) {
    throw failure(403, 'invalid path');
  }
  return decoded;
};

const readBody = async request => {
  const declared = request.headers['content-length'];
  if (declared !== undefined && (!/^\d+$/u.test(declared) || Number(declared) > MAX_BODY_BYTES)) throw failure(413, 'body too large');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw failure(413, 'body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const send = (response, status, body, headers = {}) => {
  response.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  response.end(body);
};

export const createServer = ({ assetRoot = defaultAssetRoot, controlPath } = {}) => {
  if (typeof controlPath !== 'string' || !path.isAbsolute(controlPath)) throw new Error('absolute controlPath required');
  const store = createFileStore(controlPath);
  const server = http.createServer(async (request, response) => {
    try {
      const port = server.address()?.port;
      const authority = request.headers.host;
      if (authority !== `127.0.0.1:${port}` && authority !== `localhost:${port}`) throw failure(403, 'invalid Host');
      const pathname = requestPath(request.url ?? '');
      if (pathname === '/data/control.jsonl') {
        if (request.method === 'GET' || request.method === 'HEAD') {
          const { body, etag } = await store.read();
          send(response, 200, request.method === 'HEAD' ? undefined : body, {
            'Content-Type': textType('application/x-ndjson'), 'Content-Length': body.length, ETag: etag,
          });
          return;
        }
        if (request.method !== 'PUT') throw failure(405, 'method not allowed');
        if (request.headers.origin !== `http://${authority}`) throw failure(403, 'invalid Origin');
        if (!/^application\/x-ndjson(?:;\s*charset=utf-8)?$/iu.test(request.headers['content-type'] ?? '')) throw failure(415, 'invalid Content-Type');
        const expected = request.headers['if-match'];
        if (expected === undefined) throw failure(428, 'If-Match required');
        if (!/^"sha256-[a-f0-9]{64}"$/u.test(expected)) throw failure(400, 'strong If-Match required');
        const body = await readBody(request);
        const result = await store.replace({
          expected,
          body,
          validate: (before, after) => {
            let oldText, newText;
            try { oldText = decoder.decode(before); newText = decoder.decode(after); }
            catch { throw failure(400, 'invalid UTF-8'); }
            try { validateSingleFieldEdit(oldText, newText); }
            catch (error) { throw failure(400, error.message); }
          },
        });
        if (!result.body.equals(body)) throw failure(500, 'save readback mismatch');
        send(response, 200, JSON.stringify({ etag: result.etag }), { 'Content-Type': textType('application/json'), ETag: result.etag });
        return;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') throw failure(405, 'method not allowed');
      const relative = pathname === '/' ? 'apps/control/index.html'
        : pathname === '/design.json' ? 'apps/control/design.json'
          : pathname === '/apps/control/index.html' || pathname === '/apps/control/main.mjs' || /^\/packages\/(?:[a-zA-Z0-9_-]+\/)+[a-zA-Z0-9_.-]+\.(?:mjs|js|css|json)$/u.test(pathname)
            ? pathname.slice(1) : null;
      if (!relative) throw failure(404, 'not found');
      const root = await realpath(assetRoot);
      const file = await realpath(path.resolve(root, relative));
      if (!file.startsWith(root + path.sep)) throw failure(403, 'outside asset root');
      const body = await readFile(file);
      send(response, 200, request.method === 'HEAD' ? undefined : body, { 'Content-Type': textType(typeFor(file)), 'Content-Length': body.length });
    } catch (error) {
      const status = error.status ?? (error.code === 'STALE_ETAG' ? 412 : error.code === 'ENOENT' ? 404 : 500);
      if (!response.headersSent) send(response, status, `${status}: ${status === 500 ? 'internal error' : error.message}\n`, { 'Content-Type': textType('text/plain') });
      else response.end();
    }
  });
  return server;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controlPath = process.argv[2];
  const port = Number(process.argv[3] ?? 4173);
  if (process.argv.length > 4) throw new Error('host override prohibited; loopback only');
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('valid port required');
  createServer({ controlPath }).listen(port, '127.0.0.1', () => {
    process.stdout.write(`policy-local http://127.0.0.1:${port}/\n`);
  });
}
