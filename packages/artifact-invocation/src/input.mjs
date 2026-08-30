import { canonicalJson, canonicalValue, sha256Hex } from "../../url-module/src/index.mjs";
import { artifactInputShape, validateArtifactInvocation } from "./contract.mjs";

const invariant = (condition, message) => { if (!condition) throw new Error(`artifact-input: ${message}`); };
const encoder = new TextEncoder();
const sha256 = async bytes => `sha256:${await sha256Hex(bytes)}`;
const jsonMediaType = value => value === "application/json" || value.endsWith("+json");

const deepFreeze = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

const contentType = response => String(response?.headers?.get?.("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();

const readStream = async ({ body, expectedBytes = null, maximum, name }) => {
  if (!body?.getReader) return null;
  const reader = body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      invariant(total <= maximum, `${name} exceeds ${maximum} bytes`);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (expectedBytes !== null) invariant(total === expectedBytes, `${name} byte length mismatch: ${total} != ${expectedBytes}`);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

const readResponseBytes = async ({ maximum, name, response }) => {
  invariant(response?.ok, `${name} fetch failed: ${response?.status ?? "unknown"}`);
  const header = String(response.headers?.get?.("content-length") ?? "").trim();
  const contentEncoding = String(response.headers?.get?.("content-encoding") ?? "").trim().toLowerCase();
  let expectedBytes = null;
  if (header && (!contentEncoding || contentEncoding === "identity")) {
    invariant(/^\d+$/u.test(header), `${name} content-length is invalid`);
    expectedBytes = Number(header);
    invariant(Number.isSafeInteger(expectedBytes) && expectedBytes <= maximum, `${name} exceeds ${maximum} bytes`);
  }
  const streamed = await readStream({ body: response.body, expectedBytes, maximum, name });
  if (streamed) return streamed;
  const bytes = new Uint8Array(await response.arrayBuffer());
  invariant(bytes.byteLength <= maximum, `${name} exceeds ${maximum} bytes`);
  if (expectedBytes !== null) invariant(bytes.byteLength === expectedBytes, `${name} byte length mismatch: ${bytes.byteLength} != ${expectedBytes}`);
  return bytes;
};

const inlineBytes = input => {
  if (jsonMediaType(input.mediaType)) return encoder.encode(canonicalJson(input.source.value));
  invariant(typeof input.source.value === "string", `inline input ${input.id} must be a string for ${input.mediaType}`);
  return encoder.encode(input.source.value);
};

const validateLocalFile = (value, name) => {
  invariant(value && typeof value === "object", `${name} is missing`);
  invariant(typeof value.arrayBuffer === "function", `${name}.arrayBuffer is required`);
  invariant(typeof value.name === "string" && value.name.length > 0, `${name}.name is required`);
  if (value.size !== undefined) invariant(Number.isSafeInteger(value.size) && value.size >= 0, `${name}.size is invalid`);
  return value;
};

const readLocalFile = async ({ file, maximum, name }) => {
  validateLocalFile(file, name);
  if (Number.isSafeInteger(file.size)) invariant(file.size <= maximum, `${name} exceeds ${maximum} bytes`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  invariant(bytes.byteLength <= maximum, `${name} exceeds ${maximum} bytes`);
  if (Number.isSafeInteger(file.size)) invariant(bytes.byteLength === file.size, `${name} size changed while reading`);
  return bytes;
};

const normalizeEntryPath = (value, fallback, index) => {
  const source = String(value || fallback || "");
  invariant(source.length > 0 && source.length <= 4_096, `directory entry ${index} path is invalid`);
  invariant(!source.includes("\\") && !source.startsWith("/"), `directory entry ${index} path is unsafe`);
  const parts = source.split("/");
  invariant(parts.every(part => part.length > 0 && part !== "." && part !== ".."), `directory entry ${index} path is unsafe`);
  invariant(!/[\u0000-\u001f\u007f]/u.test(source), `directory entry ${index} path contains control characters`);
  return source;
};

const ensureMediaType = ({ actual, declared, name }) => {
  if (!actual) return;
  const normalized = String(actual).split(";", 1)[0].trim().toLowerCase();
  invariant(normalized === declared, `${name} content-type mismatch: ${normalized} != ${declared}`);
};

const bindingFor = (bindings, input) => {
  invariant(Object.hasOwn(bindings, input.source.binding), `binding is missing: ${input.source.binding}`);
  return bindings[input.source.binding];
};

const blobRecord = async ({ bytes, input }) => {
  const digest = await sha256(bytes);
  if (input.digest) invariant(digest === input.digest, `input ${input.id} digest mismatch: ${digest}`);
  return Object.freeze({
    bytes,
    evidence: Object.freeze({
      bytes: bytes.byteLength,
      inputId: input.id,
      mediaType: input.mediaType,
      schema: input.schema ?? null,
      sha256: digest,
      shape: "blob",
    }),
    input,
    shape: "blob",
  });
};

const directoryRecord = async ({ files, input, limits }) => {
  const list = Array.from(files ?? []);
  invariant(list.length > 0, `directory binding ${input.source.binding} is empty`);
  invariant(list.length <= limits.maxEntries, `directory input ${input.id} exceeds ${limits.maxEntries} entries`);
  const seen = new Set();
  const entries = [];
  let total = 0;
  for (const [index, candidate] of list.entries()) {
    const file = validateLocalFile(candidate, `directory input ${input.id}[${index}]`);
    const path = normalizeEntryPath(file.webkitRelativePath, file.name, index);
    invariant(!seen.has(path), `directory input ${input.id} contains duplicate path: ${path}`);
    seen.add(path);
    const remaining = limits.maxInputBytes - total;
    invariant(remaining > 0, `directory input ${input.id} exceeds ${limits.maxInputBytes} bytes`);
    const bytes = await readLocalFile({ file, maximum: remaining, name: `directory input ${input.id}/${path}` });
    total += bytes.byteLength;
    invariant(total <= limits.maxInputBytes, `directory input ${input.id} exceeds ${limits.maxInputBytes} bytes`);
    const media = String(file.type ?? "").split(";", 1)[0].trim().toLowerCase() || "application/octet-stream";
    entries.push(Object.freeze({ bytes, mediaType: media, path, sha256: await sha256(bytes) }));
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const descriptor = entries.map(entry => ({ bytes: entry.bytes.byteLength, mediaType: entry.mediaType, path: entry.path, sha256: entry.sha256 }));
  const digest = await sha256(encoder.encode(canonicalJson(descriptor)));
  if (input.digest) invariant(digest === input.digest, `input ${input.id} digest mismatch: ${digest}`);
  return Object.freeze({
    entries: Object.freeze(entries),
    evidence: Object.freeze({
      bytes: total,
      entries: entries.length,
      inputId: input.id,
      mediaType: input.mediaType,
      schema: input.schema ?? null,
      sha256: digest,
      shape: "directory",
    }),
    input,
    shape: "directory",
  });
};

const invocationView = (request, metadata) => deepFreeze({
  constraints: request.constraints,
  expects: request.expects ?? [],
  id: request.id,
  inputs: metadata.map(input => {
    const declared = request.inputs.find(candidate => candidate.id === input.id);
    invariant(declared, `input metadata is unknown: ${input.id}`);
    return {
      bytes: input.bytes,
      entries: input.entries ?? null,
      id: input.id,
      mediaType: input.mediaType,
      mutable: declared.source.kind === "inline" && !Object.hasOwn(declared, "digest"),
      schema: input.schema,
      sha256: input.sha256,
      shape: input.shape,
      sourceKind: declared.source.kind,
    };
  }),
  intent: request.intent,
  schema: request.schema,
});

export const requiredInputFeatures = requestInput => {
  const request = validateArtifactInvocation(requestInput);
  return Object.freeze([
    ...(request.inputs.some(input => input.source.kind === "url" || input.source.kind === "reference") ? ["fetch"] : []),
    ...(request.inputs.some(input => input.source.kind === "file" || input.source.kind === "directory") ? ["file"] : []),
  ]);
};

export const resolveArtifactInputs = async ({ bindings: bindingInput = {}, fetchInput, limits, request: requestInput }) => {
  const request = validateArtifactInvocation(requestInput);
  const bindings = bindingInput && typeof bindingInput === "object" && !Array.isArray(bindingInput) ? bindingInput : {};
  const records = new Map();
  let totalBytes = 0;

  for (const input of request.inputs) {
    let record;
    if (input.source.kind === "inline") {
      record = await blobRecord({ bytes: inlineBytes(input), input });
    } else if (input.source.kind === "url") {
      invariant(typeof fetchInput === "function", "fetchInput is required for URL input");
      const response = await fetchInput(input.source.href, Object.freeze({ cache: "no-store", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" }));
      ensureMediaType({ actual: contentType(response), declared: input.mediaType, name: `input ${input.id}` });
      const bytes = await readResponseBytes({ maximum: limits.maxInputBytes, name: `input ${input.id}`, response });
      record = await blobRecord({ bytes, input });
    } else if (input.source.kind === "reference") {
      invariant(typeof fetchInput === "function", "fetchInput is required for reference input");
      const reference = input.source.reference;
      invariant(reference.bytes <= limits.maxInputBytes, `input ${input.id} exceeds ${limits.maxInputBytes} bytes`);
      const response = await fetchInput(reference.href, Object.freeze({ cache: "no-store", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" }));
      ensureMediaType({ actual: contentType(response), declared: reference.mediaType, name: `input ${input.id}` });
      const bytes = await readResponseBytes({ maximum: reference.bytes, name: `input ${input.id}`, response });
      invariant(bytes.byteLength === reference.bytes, `input ${input.id} byte length mismatch: ${bytes.byteLength} != ${reference.bytes}`);
      record = await blobRecord({ bytes, input });
    } else if (input.source.kind === "file") {
      const file = bindingFor(bindings, input);
      invariant(!Array.isArray(file), `file binding ${input.source.binding} must contain one file`);
      ensureMediaType({ actual: file.type, declared: input.mediaType, name: `input ${input.id}` });
      record = await blobRecord({ bytes: await readLocalFile({ file, maximum: limits.maxInputBytes, name: `input ${input.id}` }), input });
    } else {
      invariant(artifactInputShape(input) === "directory", `input ${input.id} source is unsupported`);
      record = await directoryRecord({ files: bindingFor(bindings, input), input, limits });
    }
    invariant(record.evidence.bytes <= limits.maxInputBytes, `input ${input.id} exceeds ${limits.maxInputBytes} bytes`);
    totalBytes += record.evidence.bytes;
    invariant(totalBytes <= limits.maxTotalBytes, `inputs exceed ${limits.maxTotalBytes} total bytes`);
    records.set(input.id, record);
  }

  const evidence = Object.freeze([...records.values()].map(record => record.evidence));
  const metadata = Object.freeze(evidence.map(item => Object.freeze({
    bytes: item.bytes,
    entries: item.entries ?? null,
    id: item.inputId,
    mediaType: item.mediaType,
    schema: item.schema,
    sha256: item.sha256,
    shape: item.shape,
  })));

  const recordFor = id => {
    const record = records.get(id);
    invariant(record, `input is unknown: ${id}`);
    return record;
  };

  const port = Object.freeze({
    evidence,
    invocation: invocationView(request, metadata),
    list: () => metadata,
    listEntries: id => {
      const record = recordFor(id);
      invariant(record.shape === "directory", `input ${id} is not a directory`);
      return Object.freeze(record.entries.map(entry => Object.freeze({ bytes: entry.bytes.byteLength, mediaType: entry.mediaType, path: entry.path, sha256: entry.sha256 })));
    },
    readBytes: id => {
      const record = recordFor(id);
      invariant(record.shape === "blob", `input ${id} is not a blob`);
      return new Uint8Array(record.bytes);
    },
    readEntryBytes: (id, path) => {
      const record = recordFor(id);
      invariant(record.shape === "directory", `input ${id} is not a directory`);
      const entry = record.entries.find(candidate => candidate.path === path);
      invariant(entry, `directory entry is unknown: ${id}/${path}`);
      return new Uint8Array(entry.bytes);
    },
    readJson: id => {
      const record = recordFor(id);
      invariant(record.shape === "blob", `input ${id} is not a blob`);
      let parsed;
      try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(record.bytes)); } catch (_) { throw new Error(`artifact-input: input ${id} is not valid UTF-8 JSON`); }
      return deepFreeze(canonicalValue(parsed));
    },
    readText: id => {
      const record = recordFor(id);
      invariant(record.shape === "blob", `input ${id} is not a blob`);
      try { return new TextDecoder("utf-8", { fatal: true }).decode(record.bytes); } catch (_) { throw new Error(`artifact-input: input ${id} is not valid UTF-8 text`); }
    },
    totalBytes,
  });

  return Object.freeze({ evidence, input: port, metadata, totalBytes });
};

export { readResponseBytes };
