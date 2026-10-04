import assert from 'node:assert/strict';
import { loadControlInput } from '../live-input.mjs';

const response = ({ status, body = '' }) => Object.freeze({
  ok: status >= 200 && status < 300,
  status,
  text: async () => body,
});

const fetcherFor = routes => async path => routes[path] ?? response({ status: 404 });

{
  const value = await loadControlInput({
    fetcher: fetcherFor({
      '/data/control.jsonl': response({ status: 200, body: '{"id":"p"}\n' }),
      '/data/claims.jsonl': response({ status: 200, body: '{"id":"d"}\n' }),
    }),
  });
  assert.equal(value.control, '{"id":"p"}\n');
  assert.equal(value.claims, '{"id":"d"}\n');
}

{
  const value = await loadControlInput({
    fetcher: fetcherFor({
      '/data/control.jsonl': response({ status: 200, body: '{"id":"p"}\n' }),
    }),
  });
  assert.equal(value.control, '{"id":"p"}\n');
  assert.equal(Object.hasOwn(value, 'claims'), false);
}

await assert.rejects(
  loadControlInput({ fetcher: fetcherFor({ '/data/control.jsonl': response({ status: 500 }) }) }),
  /control\.jsonl returned HTTP 500/u,
);

await assert.rejects(
  loadControlInput({ fetcher: fetcherFor({ '/data/control.jsonl': response({ status: 200, body: '  \n' }) }) }),
  /must not be empty/u,
);

console.log('control live input: PASS');
