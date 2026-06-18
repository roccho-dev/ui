# Changelog

## 6.2.0 — latest source UI + cached renderer integration

- latest non-zipped source UIを`golden/source`へ固定
- A2UI版のDataModel、action、runtime、pure domain engineを維持
- source UIのHTML構造・文言・responsive CSSを`AtlasSourceSurface`へ移植
- offscreen world cache、scene/overlay分離、pointer rAF集約、DPR capを統合
- modeをsource準拠の`purpose` / `responsibility` / `focus`へ統一
- 旧6分割UI componentを1つのstrict allowlisted source-UI componentへ整理
- t0〜t40の11項目完全同値witnessを追加
- desktop/mobileのfresh golden visual comparisonを追加
- standalone A2UI preview HTML buildを追加
- desktop/mobile action、ring selection、operation dedupe、zoom、hover cache検証を追加

## 6.1.0 — A2UI refactor

- A2UI v0.9 JSONLと`@a2ui/web_core` MessageProcessorを導入
- event replay、purpose contract、layout、responsibility集約をpure domain engineへ分離
- strict catalog/action/path validationを追加
