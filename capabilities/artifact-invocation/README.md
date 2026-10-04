# Artifact invocation v2

`artifact-invocation/2` is the single request contract for the universal artifact runtime.

```text
one URL / file / directory / immutable reference
  -> runtime-owned input normalization and SHA-256 evidence
  -> one trusted capability selected from a registry
  -> exact engine bytes loaded only after selection
  -> typed result + non-authority receipt
```

The request never supplies an engine URL, renderer, sandbox escape, or authority. It declares only intent, inputs, expected outputs, allowed runtimes, and `noUpload=true`.

The runtime owns transport limits, path normalization, digest verification, capability selection, engine verification, and receipts. Capability engines own domain meaning only and receive normalized input ports plus explicitly granted services.

A capability is additive:

```text
capabilities/<slug>/
├─ manifest.json
├─ engine.mjs
└─ fixtures/
   ├─ pass.json
   └─ destructive.json
```

Every capability must have positive and destructive fixtures. The publisher exposes the same exact `engine.mjs` bytes to the human view and `agent.json`; it does not generate a second implementation.

`UNSUPPORTED` and `INCONCLUSIVE` are explicit outcomes. Missing capabilities, ambiguous selection, absent runtime features, digest mismatch, over-budget input, and engine tampering never become PASS. Approval and transaction authority remain outside this package.
