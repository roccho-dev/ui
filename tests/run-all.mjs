import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRegistry } from "../apps/artifact-shell/scripts/build-registry.mjs";
import "./check-ui-modeling.mjs";
import "./check-registry.mjs";
import "./check-mention-a11y.mjs";
import "./check-purpose-atlas.mjs";
import "./check-purpose-atlas-fixture-boundaries.mjs";
import "./check-purpose-atlas-final-layout.mjs";
import "./check-a2ui-shell-data-boundary.mjs";
import "./check-generic-a2ui-shell-builder.mjs";
import "./check-contract-model-atlas-view.mjs";
import "./check-contract-model-atlas-artifact.mjs";
import "./check-editor-to-queue-to-ui-boundary.mjs";
import "./check-ui-forbidden-authority-boundary.mjs";
import "./check-repo-map-read-model-boundary-doc.mjs";
import "./check-repo-map-svgpanzoom-core.mjs";
import "./check-repo-map-svgpanzoom-external-input.mjs";
import "./check-repo-map-stable-read-model-boundary.mjs";
import "./check-repo-map-targetref.mjs";
import "./check-repo-map-hot-reload-preview.mjs";
import "./check-a2ui-adapter-artifacts.mjs";
import "./check-geomap-fileproof-artifact.mjs";
import "./check-geomap-zip-parity-artifact.mjs";
import "./check-purpose-closure-projection.mjs";
import "./check-purpose-visualization-artifact.mjs";
import "./check-purpose-visualization-stage-b.mjs";
import "./check-ui-package-evidence.mjs";
import "./check-ui-gov-package-output.mjs";
import "./check-markdown-document-renderer.mjs";
import "./check-markdown-renderer-boundary-regressions.mjs";
import "./check-connectability.mjs";
import "./check-semantic-map-ownership.mjs";
import "./check-pr-governance.mjs";
import "./check-ci-workflows.mjs";
import "./ui-runtime/architecture.mjs";
import "./ui-runtime/mutations.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = await buildRegistry({
  capabilitiesRoot: path.join(repoRoot, "apps", "artifact-shell", "capabilities"),
  output: path.join(repoRoot, "apps", "artifact-shell", "generated", "capability-registry.mjs"),
  check: false,
  write: false,
});
const registryBytes = Buffer.from(registry.source, "utf8");
const encoded = registryBytes.toString("base64");
const chunkSize = 16000;
const chunks = Math.ceil(encoded.length / chunkSize);
console.log(`UI_P2_REGISTRY_DIAGNOSTIC sha256=${createHash("sha256").update(registryBytes).digest("hex")} bytes=${registryBytes.length} chunks=${chunks}`);
for (let index = 0; index < chunks; index += 1) {
  const chunk = encoded.slice(index * chunkSize, (index + 1) * chunkSize);
  console.log(`UI_P2_REGISTRY_CHUNK ${String(index + 1).padStart(3, "0")}/${String(chunks).padStart(3, "0")} ${chunk}`);
}
console.log("ui-all-checks-pass");
