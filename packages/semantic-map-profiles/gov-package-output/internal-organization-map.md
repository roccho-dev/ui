# Internal organization Semantic Map profile

This UI-owned profile projects one exact Governance `controlSurface.bundle.v1` into the existing Semantic Map core.

```text
ADRS accepted decisions
→ Governance obligations / findings
→ Ops factory
→ observed owner-repository package surfaces
→ map/1 + graph/1 + seq/1
```

It preserves repository, package, decision, obligation, work, evidence, requirement, and closure IDs across views. Unknown inventory and unmatched required-package expectations remain visible; the profile never converts missing evidence into Green.

## Boundary

- Governance owns current-state joining and the bundle.
- UI owns labels, grouping, layout, view metadata, and interaction.
- Ops owns exact binding, deployment, and independent readback.
- Generated records, HTML, screenshots, URLs, and receipts are `authority:false`.
- No repository discovery, package scanning, conformance decision, accepted-meaning inference, provider effect, write path, profile registry, or second renderer exists here.

The first exact production input is the bundle generated from `roccho-dev/governance@7160e56aa8dbafaff4b98cc21fc4842d6600daf6` for `roccho-dev/adrs#331`.
