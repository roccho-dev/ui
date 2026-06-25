# Proposal: Generic A2UI Shell Builder v1

## Target

- repository: `roccho-dev/ui`
- base branch: `proposals`
- change class: implementation proposal only
- implementation target: not opened by this proposal
- generated HTML and per-use UI JSONL models: not merge targets

## Purpose generations

| Generation | Purpose |
|---:|---|
| G0 | Generate HTML only from A2UI declarations |
| G1 | Build a valid shell with no data |
| G2 | Keep shell structure and data cartridges physically separate |
| G3 | Attach JSONL-derived data only through `updateDataModel` |
| G4 | Keep shell digest unchanged when only data changes |
| G5 | Reject raw HTML, undeclared paths, and authority fields in data |
| G6 | Reuse one shell for CI preview and operational runtime |
| G7 | Replace product-specific handwritten HTML incrementally |
| G8 | Enable long-text → temporary UI JSONL model → HTML preview iteration |
| G9 | Make the UI implementation reproducible and transferable |

## Current evidence

Generic shell feasibility has already been demonstrated at architecture-proof level.

The existing proof demonstrates:

- combined A2UI input can be split into structure messages and data messages;
- shell input contains only `createSurface` and `updateComponents`;
- data input contains only `updateDataModel`;
- the shell generates valid HTML without a data cartridge;
- data A and data B retain the same shell digest;
- data and combined preview digests change when data changes;
- raw HTML, structure messages in data, undeclared paths, root data updates, and authority fields are rejected;
- generated HTML is marked non-authority.

Observed proof digests:

| Subject | SHA-256 |
|---|---|
| shell | `ee1c7d53f093f57e2c2d45ad35f315d1e4df49bb5ab529efb04495cb70514001` |
| data-free HTML | `73da9337cae2a5ab65caa75d29f61ac1356e1808d5185da5dd563e3e0ed534e6` |
| data A | `02717ac087796afe9eeec41854719b3d4beb7523057b2fdb4a3a101f7646bef3` |
| data B | `be62e8d5ad1a63ceb3ba0fd2ac925a35ca8e83502351c7585306b79a2f4f41a1` |
| preview A | `43a919eedd0d8d16ec55a1cf2a4876cb858bd11e5a8c027f7d4934de311ea18d` |
| preview B | `b39de1f31684821a2c6de6753a0532859027d42da89098be00e9b237242afa0d` |

This evidence proves feasibility, not production readiness or visual parity.

## Decision proposed

Implement a reusable **Generic A2UI Shell Builder v1** after this proposal is accepted.

The builder will have four explicit responsibilities:

1. **Shell compiler**
   - accepts A2UI structure messages;
   - rejects `updateDataModel`;
   - validates catalog and binding references;
   - produces a deterministic compiled shell.

2. **Data cartridge validator**
   - accepts only `updateDataModel`;
   - validates declared paths and value constraints;
   - rejects raw HTML and authority fields.

3. **Linker**
   - applies a validated data cartridge to a compiled shell;
   - never modifies shell identity;
   - produces a non-authority combined view state.

4. **Generated HTML adapter**
   - renders from compiled A2UI shell and optional view state;
   - consumes no handwritten product HTML;
   - emits data-free shell HTML and data-bound preview HTML.

## Required dependency direction

```text
A2UI declaration
+ catalog
+ data contract
+ renderer implementation
        ↓
compiled shell

domain JSONL / temporary UI JSONL model
        ↓
data projector
        ↓
updateDataModel cartridge
        ↓
validated linker
        ↓
generated HTML
```

Forbidden paths:

```text
data → component definition
data → HTML string replacement
data → direct DOM mutation
data → approval / merge / fire authority
generated artifact → source authority
```

## Implementation slices

### Slice 1: Pure shell compiler

Mergeable implementation:

- pure parser and validator;
- deterministic compiled shell model;
- shell digest including protocol, catalog, contract, compiler, and renderer versions;
- data-free state support;
- positive and negative contract tests.

No browser and no product-specific UI.

### Slice 2: Data cartridge

Mergeable implementation:

- `updateDataModel`-only validator;
- contract-scoped paths;
- data digest;
- safe application to view state;
- fail-closed negative tests.

No network transport.

### Slice 3: Generated HTML adapter

Mergeable implementation:

- allowlisted component renderers;
- escaped text output;
- generated HTML only;
- empty/loading/error rendering;
- self-contained preview artifact.

No handwritten product root HTML migration yet.

### Slice 4: Artifact behavior proof

CI-only evidence:

- build shell without data;
- attach two distinct synthetic cartridges;
- verify shell digest stability;
- verify distinct data and preview digests;
- open final artifact in a browser;
- verify no console or page errors;
- emit non-authority verification receipt.

### Slice 5: Purpose Atlas migration proposal

Separate future proposal:

- parity criteria;
- current custom-component compatibility;
- source HTML retirement;
- rollback path;
- witness comparison.

Purpose Atlas migration must not be included in the generic builder implementation PR.

## Merge boundaries

Merge:

- compiler;
- validators;
- linker;
- renderer adapter;
- data contract type;
- inline synthetic tests;
- Nix checks;
- CI workflow.

Do not merge:

- conversation-specific UI JSONL models;
- operational data;
- generated HTML artifacts;
- screenshots;
- verification receipts;
- current proof output;
- Purpose Atlas migration changes.

## CI requirements

`nix flake check` must verify:

- shell builds without data;
- structure/data inputs cannot be mixed;
- data cannot define components;
- raw HTML is rejected;
- authority fields are rejected;
- undeclared bindings and data paths are rejected;
- repeated shell build is deterministic;
- data A and data B share the same shell digest;
- data A and data B produce different data and preview digests;
- outputs state `generatedArtifactsAreAuthority: false`.

Browser behavior verification should run against the final generated artifact, not source files.

## Destructive counterexamples

1. A data cartridge contains `updateComponents`.
2. A shell declaration contains `updateDataModel`.
3. Data uses root `/` and bypasses declared paths.
4. Data introduces raw HTML.
5. Data introduces `mergeReady`, approval, canonical state, or fire authority.
6. Renderer falls back to arbitrary component execution.
7. Data-only change modifies shell digest.
8. Shell build requires a data cartridge.
9. Generated HTML becomes an edited source file.
10. CI validates source but not the distributed artifact.
11. A mutable remote resource changes output.
12. Current time, locale, random IDs, or network state changes output.
13. Purpose Atlas-specific behavior enters the generic core.
14. Preview success is treated as ADR acceptance.
15. A temporary UI JSONL model is merged as a durable product contract.

## Acceptance gates

This proposal may be promoted to an implementation PR only when:

1. the base remains `proposals`;
2. the existing architecture proof is referenced as evidence, not copied as authority;
3. generic builder scope excludes Purpose Atlas migration;
4. generated HTML and temporary UI JSONL remain non-merge artifacts;
5. implementation is split into pure compiler, data validator, linker, and generated adapter;
6. Nix and browser artifact checks are defined;
7. rollback is removal of the new parallel path, leaving the current path unchanged.

## Final statement

Generic shell feasibility is already demonstrated. The next justified action is therefore **proposal review**, not additional exploratory implementation.
