# Governance package-output semantic-map profile

This UI-owned profile projects exact `govPackageRow.v1` JSONL and the exact Governance `controlSurface.bundle.v1` organization projection into semantic-map records.

```text
governance packages.jsonl or exact controlSurface.bundle.v1
+ this profile
→ semantic-map records
→ semantic-map envelope
→ visual-evaluation HTML
```

- The source JSONL or bundle remains the meaning input.
- The profile owns labels, grouping, layout, links, and view projection only.
- Organization projection uses one shared semantic record set for `map/1`, `graph/1`, and `seq/1`.
- The projector never discovers repositories or packages and never infers missing current state.
- The projector does not infer public status, authority, lifecycle, acceptance, conformance, or business outcome.
- Unknown, missing, drift, conflict, orphan, waiver, retired, and residual rows remain explicit when present in the Governance input.
- The generated envelope and HTML are disposable and `authority:false`.
- Ops may consume an exact UI revision and exact Governance revision to assemble and deliver a page.
