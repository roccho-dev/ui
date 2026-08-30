# Governance package-output semantic-map profile

This UI-owned profile projects exact `govPackageRow.v1` JSONL into semantic-map records.

```text
governance packages.jsonl
+ this profile
→ semantic-map records
→ semantic-map envelope
→ visual-evaluation HTML
```

- The source JSONL remains the meaning input.
- The profile owns labels, grouping, layout, links, and `map/1` selection only.
- The projector does not infer public status, authority, lifecycle, acceptance, or business outcome.
- The generated envelope and HTML are disposable and `authority:false`.
- Ops may consume an exact UI revision and exact governance revision to assemble and deliver a page.
