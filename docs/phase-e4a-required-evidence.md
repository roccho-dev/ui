# UI E4a required evidence

Required evidence before merge:

- `flake.nix` includes `roccho-dev/governance/proposals` as producer input.
- `.#gov-package-output` exposes a packet using the governance producer.
- `checks.<system>.gov-package-output` validates the packet file set.
- `Nix Flake Check` builds and uploads `ui-gov-package-output`.
- `ci.intent.v1.jsonl` declares the packet artifact as non-authority evidence.
- `tests/check-ui-gov-package-output.mjs` passes through `tests/run-all.mjs`.
