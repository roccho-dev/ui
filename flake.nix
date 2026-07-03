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
      mkReadmeArtifact = pkgs:
        pkgs.runCommand "ui-readme-artifact" { nativeBuildInputs = [ pkgs.nodejs ]; } ''
          node ${self}/scripts/build-readme-artifact.mjs --out "$out"
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
      in {
        ui-modeling-corr-port = pkgs.runCommand "ui-modeling-corr-port-check" { nativeBuildInputs = [ pkgs.nodejs ]; } ''
          node ${self}/tests/run-all.mjs
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
