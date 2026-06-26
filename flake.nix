{
  description = "ui modeling core and ports";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forEachSystem = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
      mkReadmeArtifact = pkgs:
        pkgs.runCommand "ui-readme-artifact" { nativeBuildInputs = [ pkgs.nodejs ]; } ''
          node ${self}/scripts/build-readme-artifact.mjs --out "$out"
        '';
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

        generic-a2ui-preview-html = pkgs.runCommand "generic-a2ui-preview-html" { nativeBuildInputs = [ pkgs.nodejs ]; } ''
          node ${self}/scripts/build-generic-a2ui-preview.mjs "$out"
          test -s "$out/shell/index.html"
          test -s "$out/preview-a/index.html"
          test -s "$out/preview-b/index.html"
          test -s "$out/verification-receipt.json"
        '';

        purpose-atlas-preview-html = pkgs.runCommand "purpose-atlas-preview-html" { nativeBuildInputs = [ pkgs.python3 ]; } ''
          work="$TMPDIR/purpose-atlas-v6-a2ui"
          cp -R ${self}/examples/purpose-atlas-v6-a2ui "$work"
          chmod -R u+w "$work"
          python "$work/scripts/build_standalone.py"
          mkdir -p "$out"
          cp -R "$work/dist" "$out/dist"
          test -s "$out/dist/index.html"
          test -s "$out/dist/purpose-atlas-v6-a2ui-ui-refactor.preview.html"
          test -s "$out/dist/a2ui/purpose-atlas.surface.jsonl"
        '';
      });

      checks = forEachSystem (pkgs: let readmeArtifact = mkReadmeArtifact pkgs; in {
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

        purpose-atlas-preview-html = pkgs.runCommand "purpose-atlas-preview-html-check" { nativeBuildInputs = [ pkgs.python3 ]; } ''
          work="$TMPDIR/purpose-atlas-v6-a2ui"
          cp -R ${self}/examples/purpose-atlas-v6-a2ui "$work"
          chmod -R u+w "$work"
          python "$work/scripts/build_standalone.py"
          test -s "$work/dist/index.html"
          test -s "$work/dist/purpose-atlas-v6-a2ui-ui-refactor.preview.html"
          test -s "$work/dist/a2ui/purpose-atlas.surface.jsonl"
          mkdir -p "$out"
          cp "$work/dist/index.html" "$out/index.html"
          cp "$work/dist/purpose-atlas-v6-a2ui-ui-refactor.preview.html" "$out/purpose-atlas-v6-a2ui-ui-refactor.preview.html"
        '';
      });
    };
}
