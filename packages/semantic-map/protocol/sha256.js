function bytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new TextEncoder().encode(String(input));
}

function hex(input) {
  return [...new Uint8Array(input)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export async function sha256(input) {
  const digest = await crypto.subtle.digest('SHA-256', bytes(input));
  return `sha256:${hex(digest)}`;
}
