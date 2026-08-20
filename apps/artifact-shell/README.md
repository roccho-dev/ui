# Universal artifact shell

The shell is one browser execution surface for `artifact-invocation/2`.

It contains no domain switch. A generated trusted registry selects one capability from request intent, normalized input shape, media type, schema, expected outputs, and runtime constraints. The selected exact engine is fetched and verified only after selection; required renderer services are supplied by the trusted host only when declared.

A capability is one additive directory:

```text
capabilities/<slug>/
├─ manifest.json
├─ engine.mjs
└─ fixtures/
   ├─ pass.json
   └─ destructive.json
```

The shared kernel owns transport, size limits, path safety, SHA-256 evidence, selection, engine verification, and receipts. Engines own domain meaning only. New capability directories must not change shell or kernel source.

`build-publication.mjs` creates one content-addressed shared kernel and one release per capability. Every release includes:

- the exact `engine.mjs` bytes used by the registry;
- positive and destructive fixtures;
- `view.html` for people;
- `agent.json` for agents;
- a release manifest binding the engine, fixtures, and shared kernel.

The human and agent projections identify the same engine bytes. They are projections, not alternate implementations. Receipts remain `authority:false`; approval and transaction authority belong to OPS or a server-side authority.

## Bidirectional app URLs

`render.a2ui.app@1` turns one inline `a2ui-app/1` value into an interactive A2UI surface. The app value owns only:

```text
schema + state + surface
```

Trusted `Button` components may emit `artifact.state.patch` with an `artifact-state-action/1` context. The shell applies a bounded patch only below the selected input's `/state`, validates the complete next `artifact-invocation/2`, compiles it through the existing `#invoke` URL codec, updates browser history, and re-executes the request. `popstate` and a fresh browser load both restore the request from the URL.

The shell contains no app-name switch. New app meaning remains in capability data or a new additive capability directory; URL transport, history, validation, execution, and receipts remain shared.
