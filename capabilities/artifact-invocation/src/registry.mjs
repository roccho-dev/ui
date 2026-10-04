import {
  artifactCapabilityKey,
  artifactInputShape,
  validateArtifactCapabilityManifest,
  validateArtifactInvocation,
} from "./contract.mjs";

const invariant = (condition, message) => { if (!condition) throw new Error(`artifact-capability-registry: ${message}`); };

const mediaScore = (pattern, actual) => {
  if (pattern === actual) return 8;
  if (pattern === "*/*") return 1;
  const [expectedType, expectedSubtype] = pattern.split("/");
  const [actualType] = actual.split("/");
  return expectedSubtype === "*" && expectedType === actualType ? 4 : null;
};

const schemaScore = (patterns, actual) => {
  if (actual && patterns.includes(actual)) return 8;
  return patterns.includes("*") ? 1 : null;
};

const matchManifest = (manifest, request) => {
  if (!manifest.accepts.intents.includes(request.intent)) return null;
  if (request.inputs.length < manifest.accepts.minInputs || request.inputs.length > manifest.accepts.maxInputs) return null;
  if (request.expects && !request.expects.every(contract => manifest.produces.includes(contract))) return null;
  let score = 32;
  for (const input of request.inputs) {
    const shape = artifactInputShape(input);
    if (!manifest.accepts.shapes.includes(shape)) return null;
    const media = Math.max(...manifest.accepts.mediaTypes.map(pattern => mediaScore(pattern, input.mediaType) ?? -1));
    if (media < 0) return null;
    const schema = schemaScore(manifest.accepts.schemas, input.schema);
    if (schema === null) return null;
    score += media + schema + (manifest.accepts.shapes.length === 1 ? 2 : 1);
  }
  return score;
};

export const createArtifactCapabilityRegistry = input => {
  invariant(Array.isArray(input) && input.length > 0, "registry requires manifests");
  const manifests = Object.freeze(input.map(validateArtifactCapabilityManifest));
  const keys = manifests.map(artifactCapabilityKey);
  invariant(new Set(keys).size === keys.length, "registry contains duplicate capability keys");
  const ordered = Object.freeze([...manifests].sort((left, right) => artifactCapabilityKey(left).localeCompare(artifactCapabilityKey(right))));

  const resolve = requestInput => {
    const request = validateArtifactInvocation(requestInput);
    const candidates = ordered
      .map(manifest => Object.freeze({ manifest, score: matchManifest(manifest, request) }))
      .filter(candidate => candidate.score !== null)
      .sort((left, right) => right.score - left.score || artifactCapabilityKey(left.manifest).localeCompare(artifactCapabilityKey(right.manifest)));
    if (candidates.length === 0) return Object.freeze({ candidates: Object.freeze([]), kind: "unsupported", manifest: null, request });
    const highest = candidates[0].score;
    const tied = candidates.filter(candidate => candidate.score === highest);
    if (tied.length !== 1) return Object.freeze({ candidates: Object.freeze(candidates), kind: "ambiguous", manifest: null, request });
    return Object.freeze({ candidates: Object.freeze(candidates), kind: "selected", manifest: tied[0].manifest, request });
  };

  return Object.freeze({ manifests: ordered, resolve });
};
