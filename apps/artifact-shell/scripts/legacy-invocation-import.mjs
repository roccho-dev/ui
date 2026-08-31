export const LEGACY_INVOCATION_SEED_SCHEMA = "legacy-invocation-seed/1";
export const LEGACY_INVOCATION_SEED_ENTRY_SCHEMA = "legacy-invocation-seed-entry/1";
export const LEGACY_INVOCATION_OBSERVATION_SCHEMA = "legacy-invocation-observation/1";
export const LEGACY_INVOCATION_IMPORT_SCHEMA = "legacy-invocation-import/1";
export const LEGACY_INVOCATION_RECORD_SCHEMA = "legacy-invocation-record/1";

const missing = () => {
  throw new Error("legacy-invocation-import: bounded legacy classification behavior is not implemented");
};

export const importLegacyInvocationSeed = missing;
export const verifyLegacyInvocationRecord = missing;
