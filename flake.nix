{
  description = "ui modeling core and ports";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    governance = {
      url = "github:roccho-dev/governance/proposals";
      flake = false;
    };
  };

  outputs =
    { self, nixpkgs, governance }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forEachSystem = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
      purposeClosureSample = "${self}/tests/fixtures/purpose-closure/one-loop.valid.jsonl";
      purposeSurfaceSample = "${self}/tests/fixtures/purpose-atlas/surface.v0.9.jsonl";
      mkReadmeArtifact = pkgs:
        pkgs.runCommand "ui-readme-artifact" { nativeBuildInputs = [ pkgs.nodejs ]; } ''
          node ${self}/scripts/build-readme-artifact.mjs --out "$out"
        '';
      mkControlUi = pkgs:
        pkgs.runCommand "control-ui" { nativeBuildInputs = [ pkgs.nodejs ]; } ''
          set -euo pipefail
          mkdir -p "$out/apps" "$out/packages"
          cp ${self}/apps/control/index.html "$out/index.html"
          cp -R ${self}/apps/control "$out/apps/control"
          cp -R ${self}/packages/a2ui-browser "$out/packages/a2ui-browser"
          cp -R ${self}/packages/control "$out/packages/control"
          cp ${self}/examples/control/design.json "$out/design.json"
          chmod -R u+w "$out/packages/control" "$out/packages/a2ui-browser"
          rm -rf "$out/packages/control/tests" "$out/packages/a2ui-browser/tests"
          node --check "$out/apps/control/main.mjs"
          node --check "$out/packages/control/live-input.mjs"
          test -s "$out/index.html"
          test -s "$out/design.json"
          test ! -e "$out/data/control.jsonl"
          test ! -e "$out/data/claims.jsonl"
        '';

      mkUiIrArtifact = pkgs:
        pkgs.runCommand "ui-ir" { } ''
          set -euo pipefail
          mkdir -p "$out/packages/ui-ir"
          cp -R ${self}/packages/ui-ir/src "$out/packages/ui-ir/src"
          cp -R ${self}/packages/ui-ir/schema "$out/packages/ui-ir/schema"
          cp ${self}/packages/ui-ir/package.json "$out/packages/ui-ir/package.json"
          test -s "$out/packages/ui-ir/src/index.mjs"
          test -s "$out/packages/ui-ir/schema/ui-ir.v1.schema.json"
        '';
      mkA2uiBrowserArtifact = pkgs:
        pkgs.runCommand "a2ui-browser" { } ''
          set -euo pipefail
          mkdir -p "$out/packages/a2ui-browser" "$out/packages/core-port/src"
          cp -R ${self}/packages/a2ui-browser/src "$out/packages/a2ui-browser/src"
          chmod -R u+w "$out/packages/a2ui-browser/src"
          rm -f "$out/packages/a2ui-browser/src/web-core.mjs"
          cp ${self}/packages/core-port/src/jsonl.mjs "$out/packages/core-port/src/jsonl.mjs"
          cp ${self}/packages/core-port/src/project.mjs "$out/packages/core-port/src/project.mjs"
          cp ${self}/packages/core-port/src/registry.mjs "$out/packages/core-port/src/registry.mjs"
          cp ${self}/packages/core-port/src/catalog.mjs "$out/packages/core-port/src/catalog.mjs"
          test -s "$out/packages/a2ui-browser/src/index.mjs"
          test -s "$out/packages/a2ui-browser/src/render/trusted-dom.mjs"
          test ! -e "$out/packages/a2ui-browser/src/web-core.mjs"
        '';
      mkSemanticMapArtifact = pkgs:
        pkgs.runCommand "semantic-map" { } ''
          set -euo pipefail
          mkdir -p "$out/packages"
          cp -R ${self}/packages/semantic-map "$out/packages/semantic-map"
          chmod -R u+w "$out/packages/semantic-map"
          rm -rf             "$out/packages/semantic-map/tests"             "$out/packages/semantic-map/scripts"             "$out/packages/semantic-map/examples"             "$out/packages/semantic-map/migration"
          rm -f "$out/packages/semantic-map/migration-manifest.json"

          mkdir -p             "$out/packages/data-pin"             "$out/packages/core-port/src"             "$out/packages/connectability/src"             "$out/packages/url-module/src"
          cp ${self}/packages/data-pin/contract.mjs "$out/packages/data-pin/contract.mjs"
          cp ${self}/packages/data-pin/policy.mjs "$out/packages/data-pin/policy.mjs"
          cp ${self}/packages/core-port/src/intent-client.mjs "$out/packages/core-port/src/intent-client.mjs"
          cp ${self}/packages/connectability/src/index.mjs "$out/packages/connectability/src/index.mjs"
          cp ${self}/packages/url-module/src/data-transport.mjs "$out/packages/url-module/src/data-transport.mjs"
          cp ${self}/packages/url-module/src/codec.mjs "$out/packages/url-module/src/codec.mjs"
          cp ${self}/packages/url-module/src/canonical.mjs "$out/packages/url-module/src/canonical.mjs"

          test -s "$out/packages/semantic-map/runtime.js"
          test -s "$out/packages/semantic-map/renderer-maxgraph/adapter.js"
          test -s "$out/packages/semantic-map/vendor/maxgraph/view/AbstractGraph.js"
          test -s "$out/packages/data-pin/contract.mjs"
        '';

      mkPurposeVisualizationArtifact = pkgs:
        pkgs.runCommand "purpose-visualization-artifact" { nativeBuildInputs = [ pkgs.nodejs ]; } ''
          set -euo pipefail
          node ${self}/scripts/build-purpose-visualization-artifact.mjs \
            --out "$out" \
            --closure-jsonl "${purposeClosureSample}" \
            --surface-jsonl "${purposeSurfaceSample}" \
            --input-provider checked-in-sample \
            --injected-by nix
          test -s "$out/purpose-visualization-html/index.html"
          test -s "$out/purpose-visualization-html/source/purpose-closure.valid.jsonl"
          test -s "$out/purpose-visualization-html/source/purpose-atlas.surface.jsonl"
          test -s "$out/purpose-visualization-evidence/manifest.json"
          grep -q '"kind": "ui.purposeVisualizationInputContract.v1"' "$out/purpose-visualization-evidence/manifest.json"
          grep -q '"provider": "checked-in-sample"' "$out/purpose-visualization-evidence/manifest.json"
          grep -q '"injectedBy": "nix"' "$out/purpose-visualization-evidence/manifest.json"
          grep -q '"bundledSourceParity": true' "$out/purpose-visualization-evidence/manifest.json"
          grep -q '"ownsState": false' "$out/purpose-visualization-evidence/manifest.json"
          grep -q '"generatedArtifactsAreAuthority": false' "$out/purpose-visualization-evidence/manifest.json"
        '';
      mkUiGovPackageOutput = pkgs:
        let
          governanceInput = { outPath = governance; rev = "proposals"; };
          producerLib = import "${governance}/nix/gov-package-output-producer.nix" { self = governanceInput; };
        in producerLib.mkGovPackageOutput {
          inherit pkgs;
          repoId = "roccho-dev/ui";
          repoClass = "renderer-preview";
          repoPurpose = "A2UI / SDUI component registry and renderer-neutral projection package";
          projectionMode = "proposal-preview";
          status = "evidence-producer";
          packageInventory = builtins.readFile "${self}/packages/ui-claims/package-responses.v1.jsonl";
          packageAssertions = builtins.readFile "${self}/packages/ui-claims/package-responses.v1.jsonl";
          packageReceipts = (builtins.readFile "${self}/packages/ui-receipts/receipt.v1.json") + "\n" + (builtins.readFile "${self}/packages/ui-receipts/residuals.v1.jsonl");
          readmeProjectionReceipt = (builtins.toJSON {
            kind = "readmeProjectionReceipt.v1";
            repoId = "roccho-dev/ui";
            status = "proposal-preview";
            authority = false;
            nonAuthority = true;
            source = "README.md";
            boundary = "README is a projection surface only; ADRS remains meaning authority.";
          }) + "\n";
          providerCi = builtins.readFile "${self}/ci.intent.v1.jsonl";
          findings = (builtins.toJSON {
            kind = "govPackageFinding.v1";
            repoId = "roccho-dev/ui";
            status = "none";
            blocking = false;
            boundary = "No final org-active admission is claimed by the UI packet producer.";
          }) + "\n";
          admission = (builtins.toJSON {
            kind = "govPackageAdmission.v1";
            repoId = "roccho-dev/ui";
            status = "proposal-preview";
            active = false;
            boundary = "UI gov-package-output is evidence only until governance final join admits it.";
          }) + "\n";
          sourceRefs = [
            "roccho-dev/adrs#134"
            "roccho-dev/governance:nix/gov-package-output-producer.nix"
            "roccho-dev/governance:tools/check-package-gov-package-output-provenance.py"
          ];
          sourcePaths = [
            { role = "packageInventoryAndAssertions"; content = builtins.readFile "${self}/packages/ui-claims/package-responses.v1.jsonl"; required = true; }
            { role = "packageReceipt"; content = builtins.readFile "${self}/packages/ui-receipts/receipt.v1.json"; required = true; }
            { role = "packageResiduals"; content = builtins.readFile "${self}/packages/ui-receipts/residuals.v1.jsonl"; required = true; }
            { role = "projectionEvidence"; content = builtins.readFile "${self}/packages/ui-projection-evidence/projection-evidence.v1.json"; required = true; }
            { role = "artifactBoundaryProof"; content = builtins.readFile "${self}/packages/ui-projection-evidence/artifact-boundary-proof.v1.json"; required = true; }
            { role = "providerCiIntent"; content = builtins.readFile "${self}/ci.intent.v1.jsonl"; required = true; }
            { role = "readmeProjectionSurface"; content = builtins.readFile "${self}/README.md"; required = true; }
          ];
        };
    in
    {
      packages = forEachSystem (pkgs: {
        default = pkgs.writeShellApplication {
          name = "ui-modeling-corr-port-check";
          runtimeInputs = [ pkgs.nodejs ];
          text = ''
            exec node ${self}/tests/run-all.mjs "$@"
          '';
        };

        readme-artifact = mkReadmeArtifact pkgs;
        gov-package-output = mkUiGovPackageOutput pkgs;
        purpose-visualization-artifact = mkPurposeVisualizationArtifact pkgs;
        control-ui = mkControlUi pkgs;
        ui-ir = mkUiIrArtifact pkgs;
        a2ui-browser = mkA2uiBrowserArtifact pkgs;
        semantic-map = mkSemanticMapArtifact pkgs;

        generic-a2ui-preview-html = pkgs.runCommand "generic-a2ui-preview-html" { nativeBuildInputs = [ pkgs.nodejs ]; } ''
          node ${self}/scripts/build-generic-a2ui-preview.mjs "$out"
          test -s "$out/shell/index.html"
          test -s "$out/preview-a/index.html"
          test -s "$out/preview-b/index.html"
          test -s "$out/verification-receipt.json"
        '';
      });

      checks = forEachSystem (pkgs: let
        readmeArtifact = mkReadmeArtifact pkgs;
        uiGovPackageOutput = mkUiGovPackageOutput pkgs;
        purposeVisualizationArtifact = mkPurposeVisualizationArtifact pkgs;
        controlUi = mkControlUi pkgs;
        uiIrArtifact = mkUiIrArtifact pkgs;
        a2uiBrowserArtifact = mkA2uiBrowserArtifact pkgs;
        semanticMapArtifact = mkSemanticMapArtifact pkgs;
      in {
        ui-modeling-corr-port = pkgs.runCommand "ui-modeling-corr-port-check" { nativeBuildInputs = [ pkgs.nodejs ]; } ''
          node ${self}/tests/run-all.mjs
          touch "$out"
        '';

        control-ui = pkgs.runCommand "control-ui-check" { nativeBuildInputs = [ pkgs.nodejs ]; } ''
          node ${self}/packages/control/tests/live-input.mjs
          test -s ${controlUi}/index.html
          test -s ${controlUi}/design.json
          test -s ${controlUi}/apps/control/main.mjs
          test -s ${controlUi}/packages/control/model.mjs
          test -s ${controlUi}/packages/control/live-input.mjs
          test -s ${controlUi}/packages/a2ui-browser/src/feature-app.mjs
          test ! -e ${controlUi}/data/control.jsonl
          test ! -e ${controlUi}/data/claims.jsonl
          touch "$out"
        '';


        consumer-ui-ir-artifact = pkgs.runCommand "consumer-ui-ir-artifact-check" { nativeBuildInputs = [ pkgs.nodejs ]; } ''
          set -euo pipefail
          node ${self}/tests/check-static-artifact-closure.mjs ${uiIrArtifact}
          test -s ${uiIrArtifact}/packages/ui-ir/src/index.mjs
          touch "$out"
        '';

        consumer-a2ui-browser-artifact = pkgs.runCommand "consumer-a2ui-browser-artifact-check" { nativeBuildInputs = [ pkgs.nodejs ]; } ''
          set -euo pipefail
          node ${self}/tests/check-static-artifact-closure.mjs ${a2uiBrowserArtifact}
          test -s ${a2uiBrowserArtifact}/packages/a2ui-browser/src/render/trusted-dom.mjs
          test ! -e ${a2uiBrowserArtifact}/packages/a2ui-browser/src/web-core.mjs
          touch "$out"
        '';

        consumer-semantic-map-artifact = pkgs.runCommand "consumer-semantic-map-artifact-check" { nativeBuildInputs = [ pkgs.nodejs ]; } ''
          set -euo pipefail
          node ${self}/tests/check-static-artifact-closure.mjs ${semanticMapArtifact}
          test -s ${semanticMapArtifact}/packages/semantic-map/renderer-maxgraph/adapter.js
          test -s ${semanticMapArtifact}/packages/semantic-map/vendor/maxgraph/view/AbstractGraph.js
          test ! -e ${semanticMapArtifact}/packages/semantic-map/tests
          touch "$out"
        '';

        readme-artifact = pkgs.runCommand "ui-readme-artifact-check" { } ''
          test -s ${readmeArtifact}/README.md
          test -s ${readmeArtifact}/manifest.json
          test -s ${readmeArtifact}/sources.jsonl
          test -s ${readmeArtifact}/receipt.json
          grep -q '"nonAuthority": true' ${readmeArtifact}/manifest.json
          grep -q '"artifactOwner": "repo-ci"' ${readmeArtifact}/manifest.json
          grep -q '"source": "nix-output"' ${readmeArtifact}/receipt.json
          touch "$out"
        '';

        gov-package-output = pkgs.runCommand "ui-gov-package-output-check" { } ''
          set -euo pipefail
          test -s ${uiGovPackageOutput}/manifest.json
          test -s ${uiGovPackageOutput}/repo.json
          test -s ${uiGovPackageOutput}/packages.jsonl
          test -s ${uiGovPackageOutput}/assertions.jsonl
          test -s ${uiGovPackageOutput}/receipts.jsonl
          test -s ${uiGovPackageOutput}/readmeProjectionReceipt.jsonl
          test -s ${uiGovPackageOutput}/provider-ci.jsonl
          test -s ${uiGovPackageOutput}/findings.jsonl
          test -s ${uiGovPackageOutput}/admission.jsonl
          test -s ${uiGovPackageOutput}/producer-provenance.json
          test -s ${uiGovPackageOutput}/input-manifest.jsonl
          grep -q '"kind": "govPackageOutput.v1"' ${uiGovPackageOutput}/manifest.json
          grep -q '"repoId": "roccho-dev/ui"' ${uiGovPackageOutput}/manifest.json
          grep -q '"nonAuthority": true' ${uiGovPackageOutput}/manifest.json
          grep -q '"repoId": "roccho-dev/ui"' ${uiGovPackageOutput}/repo.json
          grep -q '"finalGateRef": "gov-final-scope-purpose-join / gate"' ${uiGovPackageOutput}/repo.json
          grep -q '"producerRepo": "roccho-dev/governance"' ${uiGovPackageOutput}/producer-provenance.json
          touch "$out"
        '';

        purpose-visualization-artifact = pkgs.runCommand "purpose-visualization-artifact-check" { } ''
          set -euo pipefail
          test -s ${purposeVisualizationArtifact}/purpose-visualization-html/index.html
          test -s ${purposeVisualizationArtifact}/purpose-visualization-html/manifest.json
          test -s ${purposeVisualizationArtifact}/purpose-visualization-html/source/purpose-closure.valid.jsonl
          test -s ${purposeVisualizationArtifact}/purpose-visualization-html/source/purpose-atlas.surface.jsonl
          test -s ${purposeVisualizationArtifact}/purpose-visualization-evidence/manifest.json
          grep -q '"kind": "ui.purposeVisualizationInputContract.v1"' ${purposeVisualizationArtifact}/purpose-visualization-evidence/manifest.json
          grep -q '"provider": "checked-in-sample"' ${purposeVisualizationArtifact}/purpose-visualization-evidence/manifest.json
          grep -q '"injectedBy": "nix"' ${purposeVisualizationArtifact}/purpose-visualization-evidence/manifest.json
          grep -q '"bundledSourceParity": true' ${purposeVisualizationArtifact}/purpose-visualization-evidence/manifest.json
          touch "$out"
        '';

        markdown-document-renderer = pkgs.runCommand "markdown-document-renderer-check" { nativeBuildInputs = [ pkgs.nodejs ]; } ''
          node ${self}/tests/check-markdown-document-renderer.mjs
          touch "$out"
        '';

        a2ui-shell-data-design-invariants = pkgs.runCommand "a2ui-shell-data-design-invariants" { nativeBuildInputs = [ pkgs.nodejs ]; } ''
          node ${self}/tests/check-a2ui-shell-data-boundary.mjs
          touch "$out"
        '';

        generic-a2ui-preview = pkgs.runCommand "generic-a2ui-preview" { nativeBuildInputs = [ pkgs.nodejs ]; } ''
          node ${self}/tests/check-generic-a2ui-shell-builder.mjs
          node ${self}/scripts/build-generic-a2ui-preview.mjs "$out"
        '';
      });
    };
}
