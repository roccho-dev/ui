# JSONL to HTML proof CI

## Purpose

ChatGPT preview generation is not an acceptance gate for UI behavior. The repo
should prove that checked-in A2UI JSONL can be converted into HTML preview
artifacts by CI.

## Contract

- JSONL remains `jsonl as attached data`.
- Generated HTML is `a2ui as build`.
- Generated artifacts are `non-authoritative`.
- The CI artifact must include source JSONL, generated HTML, a manifest, and a
  receipt with source JSONL digests.

## Gate

The Generic A2UI Preview workflow must:

1. Read checked-in shell/data JSONL fixtures.
2. Generate shell and data-backed HTML previews.
3. Upload the HTML, source JSONL, manifest, and verification receipt.
4. Mark the receipt with `proofKind: jsonl-to-html`.
5. Keep `generatedArtifactsAreAuthority: false`.
