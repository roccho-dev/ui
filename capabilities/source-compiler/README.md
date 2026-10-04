# source-compiler

Consumer-owned source → UI projection seam.

- `examples/**` are UI capability inputs only.
- Upstream/source fixtures live under this package, not under UI examples.
- Adapters, renderers, and publication do not depend on upstream source schemas.
- The current presentation fixture uses `business-model-semantic-jsonl/2`; it is not the canonical Decisions `Fact / Condition / Claim` authority.
- A future canonical Decisions compiler belongs behind this seam and should preserve UI feature contracts when possible.
