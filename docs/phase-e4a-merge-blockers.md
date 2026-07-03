# UI E4a merge blockers

Do not merge this PR if any of these are true:

1. `.#gov-package-output` does not build.
2. `checks.<system>.gov-package-output` does not verify the packet files and producer provenance surface.
3. The packet is described as final organization admission.
4. Generated preview output is described as source authority.
5. CI does not upload the non-authority `ui-gov-package-output` artifact.
6. `tests/check-ui-gov-package-output.mjs` is not part of `tests/run-all.mjs`.
