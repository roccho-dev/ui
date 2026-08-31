export const ARTIFACT_INVOCATION_INDEX_SCHEMA = "artifact-invocation-index/1";
export const ARTIFACT_INVOCATION_INDEX_ROW_SCHEMA = "artifact-invocation-index-row/1";
export const ARTIFACT_INVOCATION_INDEX_SOURCE_SCHEMA = "artifact-invocation-index-source/1";
export const ARTIFACT_INVOCATION_INDEX_OBSERVATION_SCHEMA = "artifact-invocation-index-observation/1";

const missing = () => {
  throw new Error("artifact-invocation-index: reconstructable index behavior is not implemented");
};

export const buildArtifactInvocationIndex = missing;
export const parseArtifactInvocationIndex = missing;
export const createArtifactInvocationIndexApp = missing;
export const createArtifactInvocationIndexRequest = missing;
