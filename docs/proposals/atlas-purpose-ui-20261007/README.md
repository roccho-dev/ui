# Atlas Purpose / one-world proposal — current discussion entry

This directory is a **discussion proposal**, not product or business-contract authority.
The current entry is intentionally small:

- [unified.md](unified.md) — discussion canonical specification: comparison invariants, authority boundaries, one-world interaction, and normalization correspondence.
- [unified.input.example.json](unified.input.example.json) — one logical input for this reproducible discussion example. “One input” does not mean one producer; it can bind multiple source domains/revisions.
- [unified.assemble.mjs](unified.assemble.mjs) — deterministic input → standalone artifact + receipt reconstruction.
- [unified.example.mjs](unified.example.mjs) / [unified.example.html](unified.example.html) — the checked interaction source/template.
- `unified.{overview,bridge,gap,removal,narrow}.jpg` — actual browser evidence for the current example.

Current normalization baseline: `b36f5b031d99e1e70fd1ea03e599bb23f08af563`.
The existing assembler baseline is 2,580,901 HTML bytes, SHA-256
`fc3ad305a53679b56cf26ce8a8a2cf1bb1e904532677ac581b364862a7324820`,
with 193 packed modules.

## Current comparison invariants

The current proposal preserves these meanings; details and correspondence live in
[unified.md](unified.md).

```text
N+/N-  = qualified entity presence only
MΔ     = owner-defined declared meaning change
RΔ     = owner-defined typed-reference change
E+/E-  = owner-defined explicit relation presence/meaning change
SΔ     = source/evidence change
TΔ     = supplied temporal-metadata change
```

The axes are distinguishable but not mutually exclusive: one source change may
produce changes on more than one axis. Their counts are never summed into a
fictitious total progress or Purpose-achievement score.

```text
G(F)      = owner typedCompare(Ideal(F), Current(F))   # business Gap
D(F0,F1) = declared Frame comparison                  # world/frame delta
ObsGap    = acquisition/history completeness gap      # not business Gap
```

Unknown effective time stays unknown. Work/Receipt completion does not imply
Purpose achievement. “Unlisted in this Frame” does not imply deleted/completed;
the counterpart and reason-unknown state remain readable.

Relation identity is owner-defined. The historical discussion implementation
`[space, kind, from, to]` edge tuple and `parts()` field classification are
examples for this fixture, not generic production comparator laws. Independent
RelationRefs/context must not be collapsed merely because endpoints/kind match.

## Authority and cleanup boundary

`unified.md` is the **discussion canonical specification** for this proposal
directory only. It does not replace apps business contracts, the current a2 world
seam, owning production adapters, or other product authority.

Historical cleanup is complete for the admitted superseded candidate set.
Deletion was allowed only after this correspondence was closed:

```text
old invariant
→ discussion canonical section
→ logical input
→ deterministic reconstruction/runtime
→ interaction/oracle
```

File-count reduction, image moves, or renames were not completion criteria.
Only history whose unique live semantics had been absorbed and proved was removed;
the exact pre-cleanup tree remains the historical authority linked below.

## Historical derivation

The superseded proposal candidates and their visual evidence were removed from the
current canonical surface only after semantic correspondence, owner-valid named
replacement proof, deterministic reconstruction equality, representative browser
operations, and independent R deletion admission were closed.

Their exact pre-cleanup forms remain recoverable in Git at:

https://github.com/roccho-dev/ui/tree/3ac6b607a5af5c4564d445fad70af11958ba7c18/docs/proposals/atlas-purpose-ui-20261007

This exact history anchor is the reference for earlier physical plans and visual
candidates. Floating branch/current links are not used as historical authority.

The retained files in this directory are the current discussion specification,
logical input, deterministic reconstruction/interaction source, template, and the
final unified browser evidence. Product/business authority remains outside this
proposal directory.
