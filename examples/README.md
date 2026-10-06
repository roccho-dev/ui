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

## Principle

> **examples = ui capability = for application usecase**

An example uses exact, small input to demonstrate the screens and operations needed by a stated application use case through reusable UI Parts/adapters.

- The dataset may be small; declared observable capability coverage must remain explicit.
- Application and example consume the same reusable UI implementation.
- Example-only copies do not prove reusable capability.
- Actual input, build, and browser evidence are required; generic rendering success or an inventory alone is insufficient.
- This principle does not imply a repository-wide rename or retrofit of unrelated examples.

## Contract

- `input/**` is source input for the example.
- `dist/**` is generated review output, never source authority or build input.
- Each example README declares its output contract:
  - **reference output**: checked-in output is compared with a fresh temporary build;
  - **generated-only output**: output is rebuilt from current source and input, may exist locally for review, and is not committed.
- Existing examples keep their current contract unless their own README says otherwise.
- `examples/atlas` is generated-only: `dist/` is locally reviewable, ignored by Git, and verified from owned temporary outputs.
- Production artifacts and their production receipts, deployment URLs, and release archives remain outside this directory. A generated example build receipt may remain beside its generated review output under that example's `dist/`.
- A capability is listed as available only when its manifest, engine, fixtures, and example all agree.

The capability declaration remains under:

```text
apps/artifact-shell/capabilities/<slug>/manifest.json
```

Reusable implementation remains under `packages/**`; the browser shell remains under `apps/artifact-shell/**`.
