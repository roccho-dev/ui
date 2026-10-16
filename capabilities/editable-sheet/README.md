# Editable sheet (non-authoritative UI library)

Editable rows and answers from JSONL, with an optional standalone offline HTML. No network, database, server, persistent local storage, external runtime, or customer schema.

**Do not check in real business JSONL or generated customer HTML.** HTML exports embed the complete supplied data; they are not anonymous or permission-filtered.

## Contract

- `sheet.jsonl`: first line is `kind: "view"` containing title, labels, idPrefix, columns, and optional description, note, filename, idDigits and nextId; later lines are `kind: "row"` entries with unique, stable IDs.
- `answers.jsonl`: independent rows keyed by an existing sheet-row ID; the columns with `scope: "answer"` are stored here.
- Column kinds: `text`, `textarea`, `checkdate`. A checkdate is an answer field. Optional `meta` lists label properties to show above editable cells.
- Labels: `save`, `exportRows`, `exportAnswers`, `add`, `delete`, `unchecked`, `confirmDelete`.
- The next generated row ID uses `idPrefix`, `idDigits` and saved `nextId`, avoiding reuse of deleted IDs.

Library exports from the default entry: `parseSheetJsonl`, `mountEditableSheet`, `sheetSnapshot`. Node-only subpath `./portable` exports `createPortableHtml`.

The portable HTML embeds the **exact same renderer source**, CSS and escaped JSONL. Its editable state is local and non-authoritative. Users may save the updated HTML, reopen it, or export the independent JSONL files.

## Example and proof

Only fictitious inspection data are checked in under `examples/editable-sheet/input/`.

Run `node capabilities/editable-sheet/tests/run.mjs`. From a Node consumer, call `createPortableHtml({sheetJsonl,answersJsonl})` to generate a single offline HTML string. Do not check its result in.

This library does not implement business validation, authentication, audience disclosure, multi-user editing, queue admission, provider delivery, or Artifact Shell registration. ui#311 covers the broader audience/portable publication boundary; this change does not close it.
