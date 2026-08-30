export function waitFor(name, timeoutMs = 15_000) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const value = globalThis[name];
      if (value?.ready === true) return resolve(value);
      if (value?.ready === false) return reject(new Error(value.error || `${name} failed`));
      if (performance.now() - started > timeoutMs) return reject(new Error(`${name} timed out`));
      setTimeout(poll, 20);
    };
    poll();
  });
}

export const waitForApp = (timeoutMs) => waitFor('semanticMapApp', timeoutMs);
export const utf8Bytes = (text) => new TextEncoder().encode(String(text)).byteLength;

export function nextFrame(count = 1) {
  return new Promise((resolve) => {
    const step = () => count-- <= 0 ? resolve() : requestAnimationFrame(step);
    requestAnimationFrame(step);
  });
}

export function readJson(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return JSON.parse(node.textContent || 'null');
}

export async function copyText(text) {
  if (!navigator.clipboard?.writeText) throw new Error('Text Clipboard API is unavailable');
  await navigator.clipboard.writeText(String(text));
  return 'clipboard.writeText';
}
