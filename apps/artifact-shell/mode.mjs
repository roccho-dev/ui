export const setArtifactShellMode = ({ document = globalThis.document, location = globalThis.location } = {}) => {
  document.body.dataset.mode = String(location.hash).startsWith("#invoke=") ? "invoke" : "launcher";
  return document.body.dataset.mode;
};

setArtifactShellMode();
globalThis.addEventListener("hashchange", () => setArtifactShellMode());
globalThis.addEventListener("popstate", () => setArtifactShellMode());
