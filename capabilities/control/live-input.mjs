const invariant = (condition, message) => {
  if (!condition) throw new Error(`control-live-input: ${message}`);
};

const readText = async ({ fetcher, path, optional = false }) => {
  const response = await fetcher(path, { cache: 'no-store' });
  if (optional && response.status === 404) return null;
  invariant(response.ok, `${path} returned HTTP ${response.status}`);
  return response.text();
};

export const loadControlInput = async ({ fetcher = globalThis.fetch } = {}) => {
  invariant(typeof fetcher === 'function', 'fetcher required');
  const control = await readText({ fetcher, path: '/data/control.jsonl' });
  invariant(control.trim(), '/data/control.jsonl must not be empty');

  const claims = await readText({ fetcher, path: '/data/claims.jsonl', optional: true });
  return Object.freeze({
    control,
    ...(claims === null ? {} : { claims }),
  });
};
