# Atlas の語彙：Issue / Package

状態：語彙案はUser採用済み。実データの取得・対応・実装の採用を意味しない。

採用根拠：[Wの6語案](https://github.com/roccho-dev/ui/pull/338#issuecomment-6049687792) + [P補正](https://github.com/roccho-dev/ui/pull/338#issuecomment-6049746632)。[R討議終端](https://github.com/roccho-dev/ui/pull/338#pullrequestreview-5450170992)、[User採用・具現化GO](https://github.com/roccho-dev/ui/pull/338#issuecomment-6050146603)。

Refs: [ui#333](https://github.com/roccho-dev/ui/pull/333), [ui#337](https://github.com/roccho-dev/ui/pull/337), [ADRS#243](https://github.com/roccho-dev/adrs/issues/243)。

目的：課題・要求を追跡する **Issue** と、責務・入出力を持つ **Package** を、供給元が明示した関係で同じAtlas上に辿る。要求する姿と確認できた実装を区別し、重複した正規化語を増やさない。

| 語 | 採用した意味・境界 |
| --- | --- |
| **Project** | この用途で独立した正規化kindを追加しない。既存の意味・ID・関係を保持し、Issueと同義にはしない。 |
| **Issue** | 課題・要求を追跡する記録。Purpose／Gap／Work／Packageとは明示された関係で区別する。Workが0件でも複数でもIssueの同一性を保つ。 |
| **Package** | 責務・入出力を持つ構成単位。同一性、要求、確認した実装、repo/pathへの配置を区別する。 |
| **Repo** | 定義や実装を保管する単位。Packageの配置先であり、その同一性とは別。 |
| **PR** | 変更提案の記録。Issueとの関係・表示は将来議論し、PRの存在やmergeだけで成果実現・課題解決・Purpose達成を主張しない。 |
| **Scope** | 供給元が示す範囲・関係を表示・集約する汎用語。範囲・包含がsourceの意味を持つ場合は保持し、Issue／Packageの同一性や包含をUIが決めない。 |

## 共通境界

- **1世界・1グラフ**は表示の統一であり、各供給元の正本を置き換えない。
- 同一性は既存のsource-space／kind／idで区別する。同名・同番号・同じpathだけで対応を補わず、repo/path移動だけで別Packageと決めない。
- Issue ↔ Packageは供給元が意味・同一性を定めた明示関係として扱い、多対多を許す。同じ両端・kindでも供給元が区別する関係の証拠を潰さない。包含は明示されたものだけを保ち、通常のグラフ関係から推測しない。
- 関係の出所・版・根拠・提案／採否の位置づけを保つ。提案・討議・syntheticの関係も、その位置づけを保って表示できる。明示入力だけを採用済み業務関係の証拠にしない。
- 未取得・未確認を取得済み・差なし・関係なし・削除・完了にしない。実装証拠0件だけでは、実装済みとも実装不在とも断定しない。要求の存在を実装実在へ昇格しない。
- 既存のsynthetic `proj-*`を、同一性の対応根拠なしにIssueへ改名・変換しない。
- 「対象／影響／実装」は関係の例示であり、必須の3分類にはしない。契約Package／実装Packageという別kind、具体ID codec、新しい採否必須field・判定器・取得機構をこの語彙採用から追加しない。
- ADRS#243は要求契約と実装主張を分ける参照提案であり、この語彙採用は同Issue全体の採用・実装完了を意味しない。

## 実データの未決

1. 実Issue／Packageの供給元と同一性対応。
2. 要求／実装の対応根拠。
3. 関係owner・意味・証拠／採否／取得完全性の供給方法。

取得元・具体対応を未決のまま、意味の混同を防ぐ語彙だけを採用する。具体schema／API／取得方法や実データ接続の実装採否には進まない。

## 反映範囲

PR #338はこの語彙文書とPR本文への採用版反映に限る。Atlas表示の具現化は[GO](https://github.com/roccho-dev/ui/pull/338#issuecomment-6050146603)に従い、現行[ui#336](https://github.com/roccho-dev/ui/pull/336)を基盤とする別の専用Draft PRで扱う。合成データの表示・検証と実観測接続を区別し、#338へUI差分を混ぜない。merge／closeは許可されていない。
