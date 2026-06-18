# Changelog

## 6.1.0 — A2UI refactor

- standalone HTMLの画面構造をA2UI v0.9 JSONLへ移行
- `@a2ui/web_core/v0_9` `MessageProcessor` / `DataModel` / action dispatchを導入
- `@a2ui/lit/v0_9` custom catalog componentへ表示を分割
- event replay、purpose contract、layout、responsibility集約をpure domain engineへ分離
- 40 event、3 purpose transition、責務リング、pan/zoom、Inspector操作を維持
- strict component API、catalog/action/path allowlist、payload上限を追加
- direct `getElementById`、`innerHTML`、実行可能JSON payloadを撤去
- 14 contract tests、production build、desktop/mobile実ブラウザ検証を追加
- dependency auditで検出したVite/esbuildを安全版へ更新し、`npm audit` 0件を確認
