# Editor to queue to UI boundary

## Purpose

This document fixes the ui-side boundary for the editor-to-queue-to-ui flow.

`ui = targetRef emitter + projection reader + preview`.

The repo keeps browser and generated preview surfaces read-only. UI output can help a human select a target, and it can show projection evidence produced elsewhere. It must not become the queue runtime, admission gate, accepted ledger, or model authority.

## Data flow

```text
ops projection artifact
  -> ui repoMap preview

ui selection
  -> ui.targetRef.v1 metadata
  -> edits queue writer
  -> ops queue runtime
  -> ops receipt / projection artifact
  -> ui preview
```

## Owned by ui

| Surface | Role | Authority |
|---|---|---:|
| `ui.targetRef.v1` metadata | Proposal-only selection metadata for local/dev tooling | false |
| `repoMap.projection.v1` input | External read-model artifact consumed by repoMap preview | false |
| localhost preview | Local visual evidence and reload surface | false |
| generated HTML / manifest / screenshots | Build evidence | false |

## targetRef contract

`ui.targetRef.v1` is metadata, not action authority.

A valid targetRef emitted by UI must be useful for local/dev tooling and must carry this meaning:

| Field | Required meaning |
|---|---|
| `kind` | `ui.targetRef.v1` |
| `targetKind` | `projectionNode`, `relation`, or another read-model target type |
| `targetId` | ID of the rendered read-model target |
| `sourceType` / `sourceKind` / `sourceId` | Evidence of the read-model record that produced the target |
| `authority` | `false` |
| `proposalOnly` | `true` |

A targetRef may help an editor queue writer prepare a human-confirmed command. It must not approve, promote, dispatch, merge, admit, append queue rows, write accepted ledger rows, or generate receipts.

## ops projection artifact input

UI may read an ops-produced repoMap projection artifact when it is passed as an external projection input. UI records the input path, source copy, digest, and provider evidence in the generated manifest.

This is still read-only. The ops artifact is evidence for rendering, not UI-owned source authority. UI must not validate admission, rebuild the accepted ledger, or promote a model commit when reading this input.

## localhost hot reload proof

Localhost hot reload is local/dev evidence only. Its receipt may record the source projection digest and generated preview digest so a reviewer can compare before and after render output.

A digest change proves the preview artifact changed when the external projection input changed. It does not make the preview artifact an accepted ledger, admission receipt, or model authority.

## Not owned by ui

| Surface | Owning side | Why |
|---|---|---|
| queue rows | `edits` writes, `ops` validates and processes | UI selection is not human command confirmation |
| accepted ledger rows | `ops` | Admission is outside the browser renderer |
| admission receipts | `ops` | Receipt generation belongs with queue runtime |
| model authority | `ops` accepted ledger / contract core | UI reads projections only |
| projection building authority | `ops` | UI may render projection artifacts, not decide source model truth |

## Allowed in ui

- Render a `repoMap.projection.v1` artifact.
- Preserve `ui.targetRef.v1` metadata on nodes and edges.
- Show preview evidence from an external projection artifact.
- Record digest, provider, path, and source-copy evidence in generated manifests.
- Keep camera state runtime-only and non-authority.

## Forbidden in ui

- Append queue rows from browser code.
- Write accepted ledger rows.
- Perform admission or promotion.
- Generate ops receipts as authority.
- Add approve, promote, dispatch, merge, or fire buttons.
- Treat generated HTML, screenshots, manifests, or preview digests as source authority.

## Static forbidden authority check

`tests/check-ui-forbidden-authority-boundary.mjs` scans UI implementation roots for code paths that look like queue writers, accepted-ledger writers, admission owners, or browser approval actions. Boundary docs and tests may mention these terms to define forbidden behavior, but implementation packages must not own them.

## Acceptance for ui#127

- README states the boundary in one sentence.
- This document states the flow: `ops projection -> ui repoMap preview`.
- This document links targetRef emission to the edits queue writer and ops runtime.
- Static check proves the boundary text is present.
- Existing repo-map tests remain the implementation proof for external input, targetRef metadata, and localhost preview.

## Acceptance for ui#128

- targetRef metadata is documented as proposal-only.
- generated repo-map targetRef payloads include `authority:false` and `proposalOnly:true`.
- static checks reject browser authority language around approval, dispatch, admission, and accepted ledger writes.

## Acceptance for ui#129

- an ops repoMap projection artifact fixture renders through the existing repo-map external projection path.
- manifest evidence records path, provider, source copy, and digest.
- generated preview remains non-authority evidence.

## Acceptance for ui#130

- hot reload proof records source projection digest and generated preview digest.
- before/after projection changes produce different preview digests.
- localhost hot reload remains non-authority evidence.

## Acceptance for ui#131

- forbidden authority check scans implementation roots.
- queue append, accepted ledger write, admission owner, and browser approval action patterns fail.
- docs explain allowed evidence-only mentions.
