# Preview digest against ops receipt

## Purpose

UI may verify that the generated preview artifact digest matches an ops cross-repo receipt.

This verification is read-only. It does not generate an ops receipt, admit a queue row, write an accepted ledger row, or make the preview artifact source authority.

## Data flow

```text
ops cross-repo receipt
  -> previewDigest

ui generated preview/index.html
  -> sha256 digest

previewDigest == sha256(preview/index.html)
  -> ui.previewDigestVerification.v1 evidence
```

## Rules

- Matching digest passes.
- Mismatched digest fails clearly.
- Verification reads receipt and preview only.
- UI does not write queue, admission, receipt, or accepted ledger state.
- Ops owns receipt generation.
