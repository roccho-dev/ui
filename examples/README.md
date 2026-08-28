# Capability examples

Each directory under `examples/` demonstrates one executable UI capability with both the exact input and a generated, reviewable output.

```text
examples/<capability-id>/
├─ README.md
├─ input/
│  └─ ... exact invocation or domain input
└─ dist/
   └─ ... generated browser output
```

## Contract

- `input/**` is the example input.
- `dist/**` is a generated example artifact, not source authority.
- `dist/**` must be reproducible from the adjacent input and current source.
- Builds must write to a temporary directory first and compare against the checked-in example.
- Example output must never be consumed as source or as a build input.
- Production artifacts, receipts, deployment URLs, and release archives remain outside this directory.
- A capability is listed as available only when its manifest, engine, fixtures, and example all agree.

The capability declaration remains under:

```text
apps/artifact-shell/capabilities/<slug>/manifest.json
```

Reusable implementation remains under `packages/**`; the browser shell remains under `apps/artifact-shell/**`.
