# Purpose Atlas JSONL HTML probe

This probe changes only the canonical A2UI surface JSONL fixture to verify that a proposal-branch push can drive the Purpose Atlas preview HTML build path.

Expected path:

```text
tests/fixtures/purpose-atlas/surface.v0.9.jsonl
  -> packages/purpose-atlas-preview sync/preBuild
  -> nix build .#purpose-atlas-preview-html
  -> result/dist/*.html
```

Non-scope:

- Do not merge as a product change.
- Do not add generated HTML to git authority.
- Do not add artifact upload workflow in this probe.
