{
  description = "ui modeling core and ports";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forEachSystem = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      packages = forEachSystem (pkgs: {
        default = pkgs.writeShellApplication {
          name = "ui-modeling-corr-port-check";
          runtimeInputs = [ pkgs.nodejs ];
          text = ''
            exec node ${self}/tests/check-ui-modeling.mjs "$@"
          '';
        };
      });

      checks = forEachSystem (pkgs: {
        ui-modeling-corr-port = pkgs.runCommand "ui-modeling-corr-port-check" { nativeBuildInputs = [ pkgs.nodejs ]; } ''
          node ${self}/tests/check-ui-modeling.mjs
          touch "$out"
        '';
      });
    };
}
