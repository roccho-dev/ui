# ui-ir

Renderer-neutral contract between an application decision layer and UI capabilities.

```text
decision
  -> ui.ir.v1 { capability, payloadKind, payload }
  -> capability-owned validation/rendering
  -> DOM / SVG / Canvas
```

This package owns only the UI invocation envelope and its validation.

It does not own application composition, Jev/product meaning, ASR, secrets, or renderer-specific payload meaning. A2UI and semantic-map keep validating and rendering their own payloads.
