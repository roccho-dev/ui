// Finite fixture producer of Live Atlas `snapshot` server-sent events. It is
// test and manual-proof input only; the Atlas UI never produces state.
//
// Imported: startAtlasProducer({ connections }) plays one scripted list of
// steps per incoming connection: { data } sends one event, { delayMs } waits,
// { close: true } ends that connection. Further connections stay open silent.
//
// Standalone (manual live proof):
//   node tests/fixtures/live-atlas/sse-producer.mjs --port=18084 [--interval-ms=4000]
// broadcasts the sample history in a loop as new revisions stamped with the
// current time, at http://127.0.0.1:<port>/events.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HEADERS = Object.freeze({
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*',
});

const eventText = data => {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  return `event: snapshot\n${body.split(/\r?\n/u).map(line => `data: ${line}`).join('\n')}\n\n`;
};

const listen = (handler, { host, port }) => new Promise((resolve, reject) => {
  const server = http.createServer(handler);
  server.once('error', reject);
  server.listen(port, host, () => resolve(server));
});

export const startAtlasProducer = async ({ connections, host = '127.0.0.1', port = 0, retryMs = 100 }) => {
  const open = new Set();
  let served = 0;
  const server = await listen(async (request, response) => {
    if (new URL(request.url, 'http://localhost').pathname !== '/events') {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    response.writeHead(200, HEADERS);
    response.write(`retry: ${retryMs}\n\n`);
    open.add(response);
    response.on('close', () => open.delete(response));
    const steps = connections[served] ?? [];
    served += 1;
    for (const step of steps) {
      if (response.writableEnded) return;
      if (step.delayMs) await new Promise(resolve => setTimeout(resolve, step.delayMs));
      if (step.close) { response.end(); return; }
      if (step.data !== undefined) response.write(eventText(step.data));
    }
  }, { host, port });
  return Object.freeze({
    url: `http://${host}:${server.address().port}/events`,
    served: () => served,
    close: () => new Promise(resolve => {
      for (const response of open) response.end();
      server.close(() => resolve());
      server.closeAllConnections?.();
    }),
  });
};

// Shifts every instant in a snapshot by the same offset so that a recorded
// sample becomes a current revision; the content is otherwise unchanged.
export const restamp = (snapshot, rev, asOfMs) => {
  const shift = asOfMs - Date.parse(snapshot.asOf);
  const move = value => new Date(Date.parse(value) + shift).toISOString();
  const channels = { ...snapshot.channels };
  if (channels.observations) {
    const rows = channels.observations.text.split('\n').filter(Boolean).map(line => {
      const row = JSON.parse(line);
      for (const key of ['observedAt', 'createdAt']) if (row[key]) row[key] = move(row[key]);
      return JSON.stringify(row);
    });
    channels.observations = { text: `${rows.join('\n')}\n` };
  }
  return { ...snapshot, rev, asOf: move(snapshot.asOf), channels };
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map(argument => {
    const index = argument.indexOf('=');
    if (!argument.startsWith('--') || index < 3) throw new Error(`expected --name=value, got ${argument}`);
    return [argument.slice(2, index), argument.slice(index + 1)];
  }));
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const { resolveHistory } = await import('../../../scripts/build-live-atlas.mjs');
  const history = await resolveHistory(path.resolve(repoRoot, args.history ?? 'tests/fixtures/live-atlas/history.json'));
  const intervalMs = Number(args['interval-ms'] ?? 4000);
  const open = new Set();
  let latest = null;
  let tick = 0;
  const server = await listen((request, response) => {
    if (new URL(request.url, 'http://localhost').pathname !== '/events') {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    response.writeHead(200, HEADERS);
    response.write('retry: 1000\n\n');
    if (latest) response.write(eventText(latest));
    open.add(response);
    response.on('close', () => open.delete(response));
  }, { host: args.host ?? '127.0.0.1', port: Number(args.port ?? 18084) });
  const publish = () => {
    latest = restamp(history.snapshots[tick % history.snapshots.length], tick + 1, Date.now());
    tick += 1;
    for (const response of open) response.write(eventText(latest));
  };
  publish();
  setInterval(publish, intervalMs);
  console.log(`live-atlas fixture producer http://${server.address().address}:${server.address().port}/events (Ctrl+C stops it)`);
}
