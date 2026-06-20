# Golden / Witness verification

- Status: **PASS**
- Golden: `golden/source/ui-shell.html` (uncompressed files copied from latest source tree)
- Candidate: `dist/purpose-atlas-v6-a2ui-ui-refactor.preview.html`
- Semantic projections: **41/41 exact**, hash `b4cd99919d463414b9a1914daf0fd03e419c549e457f93cfad8475b46ca567c4`

| viewport | SSIM | pixels Δ≤15 | max geometry delta | text | result |
|---|---:|---:|---:|---|---|
| desktop | 0.999954 | 99.979365% | 0.062px | exact | PASS |
| mobile | 0.999955 | 99.974784% | 0.032px | exact | PASS |

The semantic witness compares the original latest source UI and the A2UI candidate at every timeline state t0–t40. Visual screenshots are freshly rendered from both implementations under the same browser, viewport, DPR, and reduced-motion settings.
