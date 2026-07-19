const COMPILER_MARKER = "compiler-v1";

export function compileScene(source) {
  return {
    ...source,
    compilerMarker: COMPILER_MARKER,
  };
}
