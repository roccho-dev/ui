export const ARTIFACT_INVOCATION_REFERENCE_SCHEMA = "artifact-invocation-reference/1";
export const ARTIFACT_INVOCATION_OBSERVATION_SCHEMA = "artifact-invocation-observation/1";
export const ARTIFACT_INVOCATION_CODEC_ID = "url-module";
export const ARTIFACT_INVOCATION_CODEC_VERSION = "1";
export const ARTIFACT_INVOCATION_FRAGMENT = "invoke";

const missing = () => {
  throw new Error("artifact-invocation-reference: version-fixed invocation behavior is not implemented");
};

export const createArtifactInvocationIdentity = missing;
export const compileArtifactInvocationReference = missing;
export const decodeArtifactInvocationReference = missing;
export const verifyArtifactInvocationReference = missing;
export const verifyArtifactInvocationProof = missing;
