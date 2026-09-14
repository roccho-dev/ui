import { setArtifactShellMode } from "../mode.mjs";
import { createArtifactShell } from "./shell.mjs";
import { registerArtifactShellWebMcp } from "./webmcp.mjs";

setArtifactShellMode();
globalThis.addEventListener("popstate", () => setArtifactShellMode());
globalThis.addEventListener("hashchange", () => setArtifactShellMode());

const elements = Object.freeze({
  form: document.querySelector("#request-form"),
  localInputs: document.querySelector("#local-inputs"),
  progress: document.querySelector("#progress"),
  receipt: document.querySelector("#receipt"),
  request: document.querySelector("#request"),
  result: document.querySelector("#result"),
  run: document.querySelector("#run"),
  status: document.querySelector("#status"),
  surface: document.querySelector("#surface"),
});

createArtifactShell({ elements }).then(async shell => {
  try {
    globalThis.artifactShellWebMcp = await registerArtifactShellWebMcp({ document, shell });
  } catch (error) {
    globalThis.artifactShellWebMcp = Object.freeze({ available: false, error: String(error.message) });
  }
}).catch(error => {
  elements.status.dataset.state = "inconclusive";
  elements.status.textContent = `INCONCLUSIVE · ${error.message}`;
  globalThis.artifactShellProof = Object.freeze({ error: String(error.message) });
});
