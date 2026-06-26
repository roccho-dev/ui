# Source provenance

UI goldenは、latest source treeの非圧縮ファイルを`golden/source/`へそのまま保存したものです。

```text
ui-shell.html
ui.css
ui-renderer.js
model-core.js
build_preview.py
```

ZIP内のdist HTMLをUI正本にはしていません。各source hashは`golden/GOLDEN_LOCK.json`で固定しています。
