# UI E4a post-merge state

After this PR merges:

- UI has a pinned governance producer input.
- UI exposes a Nix-visible `gov-package-output` package.
- UI Nix checks validate the packet shape and producer provenance surface.
- UI CI uploads `ui-gov-package-output` as non-authority evidence.
- UI does not claim final org admission or branch-protection cutover.
