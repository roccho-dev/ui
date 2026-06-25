// Single entry point that runs every ui check. Used by both `npm test` and the
// Nix flake check so local and SSOT verification exercise the same surface.
import "./check-ui-modeling.mjs";
import "./check-registry.mjs";
import "./check-mention-a11y.mjs";
import "./check-purpose-atlas.mjs";
import "./check-a2ui-shell-data-boundary.mjs";
import "./check-generic-a2ui-shell-builder.mjs";
console.log("ui-all-checks-pass");
