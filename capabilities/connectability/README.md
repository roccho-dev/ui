# UI connectability

A UI-owned output port for reviewed JSON proposals.

```text
domain adapter
→ prepare canonical bytes and digest
→ submit to one same-origin endpoint
→ observe submitted / recorded state
```

This package owns transport-neutral preparation and browser-side submission only. It does not know Semantic Map, GitHub, Issues, R2, OIDC, accepted authority, or current state.

Domain meaning stays in the caller-owned adapter. Provider effects stay behind the same-origin endpoint.
