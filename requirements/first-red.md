# P1最初のRED — RC-01公開契約案

**P0でreviewする最小提案。製品APIの実装・公開済み宣言ではない。** [README](README.md)のP0受理・Q01・Q03が成立してから、この一件を実行可能化する。後段の全イベント型・全schema・外部接続を先に実装しない。

## 入出力

提案する公開入口は `packages/core/index.mjs` の `reduceUiEvents(events)`。同期・純粋関数として、呼出し側が取得・受理を確認したUIイベント列から `{schema:'ui-state/1', logId, head, definition}` を返す。上流の業務reduce、取得、AI生成、DOM、副作用は担当外。テストが自分で付けた `accepted:true` を実業務の受理証明にしない。入力の出所・受理結果の照合はIN/TR/AC側で別に検証する。

`fixtures/rc01.json` のeventsが正例。上流sourceは**テストport用の架空fixture**であり、外部の正式な意思決定schemaをUIが定義したものではない。UIdefinitionの目的・制約・decisionRefsはUI独自契約、`a2uiMessages`内部は公式A2UI形式への参照であり別DSLにしない。

A2UIのText表現は公式Simple Text example（Git blob `81cab829f5faa5920e20f5fe17d94232829497fa`）の形式を基にする。この例はv0_9_1ディレクトリにありながらwire version/catalog URLはv0.9である。ディレクトリ名から対応版を推測せず、P2でrenderer・catalog実体を固定して同じfixtureを実描画検証する。ここでは公式rendererとの互換成立をまだ主張しない。

初期UIイベントは `schema,logId,eventId,parent,kind,definition` を持ち、最初のkindは `ui.define`、parentはnull、headはeventId。definitionは `purpose,constraints,decisionRefs,a2uiMessages`。この時点のeventIdはテスト用の不変IDであり、実サービスでの改竄耐性・認証は証明しない。hash/履歴・commit原子性・candidate/accepted区別はIN/AC/RPの必要条件として後続に残す。正式な追加契約を受理するときはfixture/期待値/対応表を同じPRで更新する。

空文字JSONL・空event配列は初期化不足として拒否する案。意図した空画面は正式なUI定義に目的と空状態を明示して扱う案であり、空入力を空成功画面へ補完しない。IN-10で独立に具体化・受理してから実装する。最初のRC-01にこの異常系をまとめて先行コード化しない。

## RC-01の独立期待値

- logId=`ui:f01`、head=`ui-event:f01:1`。
- Text `t-01` の文字は**案件A**。勝手に別名・空・HTML化しない。
- 対応根拠は `d-01`、不変版`1`、対応箇所`/title`、UI対象`t-01`。
- eventsとsourceの入力は非変更。戻り値の定義は入力とmutable aliasを共有しない。
- 意味や表示方針を新しく作らず、既に決めた定義をUI状態へ復元する。

次のファイルをP1のRED PRで作る。P0には実行可能な製品REDを先行配置しない。

```js
// tests/ui-207/rc01.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reduceUiEvents } from '../../packages/core/index.mjs';

test('RC-01: accepted UI events retain text and exact decision reference', () => {
  const fixture = JSON.parse(readFileSync(
    new URL('../../requirements/fixtures/rc01.json', import.meta.url), 'utf8'));
  const before = structuredClone(fixture);
  const actual = reduceUiEvents(fixture.events);
  assert.equal(actual?.schema, 'ui-state/1', 'RC-01/state');
  assert.equal(actual?.logId, 'ui:f01', 'RC-01/log');
  assert.equal(actual?.head, 'ui-event:f01:1', 'RC-01/head');
  const component = actual.definition?.a2uiMessages
    .flatMap(message => message.updateComponents?.components ?? [])
    .find(component => component.id === 't-01');
  assert.equal(component?.text, '案件A', 'RC-01/text');
  assert.deepEqual(actual.definition?.decisionRefs, [
    { decisionId: 'd-01', version: '1', pointer: '/title', targetId: 't-01' },
  ], 'RC-01/reference');
  assert.deepEqual(fixture, before, 'RC-01/input-not-mutated');
  assert.notStrictEqual(actual.definition, fixture.events[0].definition,
    'RC-01/no-mutable-input-alias');
});
```

```sh
node --test tests/ui-207/rc01.test.mjs
```

最初は公開module/exportだけを最小に置き、まだdefinitionを復元しない状態から始められる。例えば入力のlogId/headだけを返してdefinitionをnullにする。RED時は `RC-01/text` など対象の欠落を示すassertionが実際に失敗することを確認する。無条件 `assert.fail()`、テスト内の偽実装、例外の握り潰し、`ERR_MODULE_NOT_FOUND` は機能REDの代用にしない。仮の本体を既存の正しい処理の破壊で作らない。

RED証跡はcommand/exit/assertion/actual/expected/commit/fixture hashを残す。GREENでは最低限のreduceを実装してこの一件と既存回帰を通す。RED専用allow-failを既定検査へ残さない。既に成立する場合は現在のGREENを記録し、次の未達へ進む。

## 次に選ぶ順序

RC-01のGREEN後、IN-03（上流logの誤入力拒否）、TR-05（根拠版取り違え）、RC-05（compile）、UI-01（実公式Text表示）、UI-06/GR-04（図内包・確定配置）、ED-01/AC-01（ローカル往復）、RP-01（fresh復元）を候補にする。一つの段階に未GREENのシナリオを積まず、依存するQを閉じる。全順序・残りの分母はcoverage-mapとTest Listに残る。

RC-01だけで参照の真実性、全schema、A2UI実表示、図操作、外部受理、業務判断の妥当性を証明したとは扱わない。
