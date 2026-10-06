# Capability examples

Each directory under `examples/` demonstrates one executable UI capability with exact input and a reviewable browser output.

```text
examples/<capability-id>/
├─ README.md
├─ input/
│  └─ ... exact invocation or domain input
└─ dist/
   └─ ... generated browser output
```

## Contract

- `input/**` is source input for the example.
- `dist/**` is generated review output, never source authority or build input.
- Each example README declares its output contract:
  - **reference output**: checked-in output is compared with a fresh temporary build;
  - **generated-only output**: output is rebuilt from current source and input, may exist locally for review, and is not committed.
- Existing examples keep their current contract unless their own README says otherwise.
- `examples/atlas` is generated-only: `dist/` is locally reviewable, ignored by Git, and verified from owned temporary outputs.
- Production artifacts, receipts, deployment URLs, and release archives remain outside this directory.
- A capability is listed as available only when its manifest, engine, fixtures, and applicable example/evidence agree.

The capability declaration remains under:

```text
apps/artifact-shell/capabilities/<slug>/manifest.json
```

Reusable implementation remains under `packages/**`; the browser shell remains under `apps/artifact-shell/**`.
