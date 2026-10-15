# ChecklistUI (SheetUI extension)

ChecklistUI reuses the **merged** SheetUI #347. It adds only a completed / total counter, computed from the existing single `checkdate` answer column. No second renderer, stored done flag, database, server, role filter or workflow.

- Use the same `sheet.jsonl` and `answers.jsonl` accepted by SheetUI; the view labels additionally require `progress` for the counter's accessible label.
- Browser: import `mountChecklist(root, {sheetJsonl, answersJsonl, onSave, onExport, onChange})`. The return value is SheetUI's normal snapshot interface. Both JSONL exports remain independent.
- Pure: `checklistProgress(sheetJsonl, answersJsonl)` returns `{completed, total}`. Exactly one `checkdate` answer column is required; a completed value must be a real ISO calendar date. Unchecking clears it.
- Offline: use the **existing** `createPortableHtml` from `@roccho/editable-sheet/portable`. The exported standalone HTML retains the same editing, check dates, comments, save/reopen and exports; it does not render the extra progress output yet. A second portable renderer is explicitly out of scope.
- Future/deferred tasks: supply a separate checklist dataset; never inflate the active checklist's denominator.
- Check date records a user's click, **not** proof that an external deployment or acceptance succeeded.

The source fixture is the synthetic `examples/editable-sheet/input/` dataset. Never commit customer release HTML, task instructions, real customer JSONL, credentials or secrets.

Invariant: `ChecklistUI = SheetUI + DerivedProgress`; `Completed = Count(valid checked_at)`. Progress is never persisted. No new HTML/CSS renderer.
