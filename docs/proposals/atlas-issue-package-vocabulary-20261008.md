# Atlas の語彙：Project / Issue / Package（議論案）

Refs: [ui#333](https://github.com/roccho-dev/ui/pull/333), [ui#337](https://github.com/roccho-dev/ui/pull/337), [ADRS#243](https://github.com/roccho-dev/adrs/issues/243)

目的：人が管理する **Issue** と、repo 内の実体 **Package** を同じ Atlas で辿る。重複した正規化語を増やさない。

| 現在・候補の語 | 提案 | 意味・関係 |
| --- | --- | --- |
| **Project** | **正規化語から廃止** | この用途では Issue と同義。独立した entity kind を作らない |
| **Issue** | 残す | 人が定義する課題・仕事のまとまり。Package への対象関係は明示入力のみ |
| **Repo** | 残す | 実装の保管単位。Package の配置先 |
| **Package** | 残す・実体の主軸 | 入出力・責務を持つ単位。ADRS 契約と repo 実体を混同せず対応付ける |
| **PR** | 残す・表示は将来議論 | Issue が複数 PR を束ねる関係は候補。今は必須 UI / 契約にしない |
| **Scope** | UI 内部の汎用語として残す | 表示・集約範囲。Issue / Package と同一視しない |

**境界：** 既存の synthetic `proj-*` scope を、実 Issue ID がないまま Issue に改名・変換しない。Issue ↔ Package は多対多を許し、名前やディレクトリから関係を推測しない。人側と実体側は **1世界・1グラフ** の別の種類／見方であり、別の正本や画面を増やさない。

**議論の残件：** 実 Issue ID の取得元、Repo/Package の実体取得元、Issue→Package の明示関係の所有者と証拠。Projectの削除は正規化語の提案であって、既存データの削除ではない。

**Scope：** docs 上の語彙比較のみ。UI/fixture/schema/apps/ADRS契約/producer/SSE/CI変更なし。実装・採択・merge はこの PR に含めない。
