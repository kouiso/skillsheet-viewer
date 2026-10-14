# 閲覧文字コントラストの検証記録

Issue #369。2026-10-14に架空データだけのシートで確認した。
閲覧実装の基準は main `3302ca8d6f1f2c2ed01e60e018309b0979b63245`。
検証用DBは手元の使い捨てPostgreSQL。本番DBには接続していない。

## 実装と合格条件

`e2e/text-contrast.spec.ts` が閲覧本文・メタ文字を検査する。
`e2e/contrast.ts` は文字色と背景色の半透明層を合成する。
計測できない描画効果と計測対象ゼロも失敗として扱う。
入力境界の検査も同じヘルパーを使う。

`requiredTextRatio` の下限は通常文字4.5。
24px以上の文字と太字18.66px以上の文字は3。
Issue本文の大きい文字のサイズ条件はこの実装と逆順なので注意する。

基準mainの [CI run 38365155695](https://github.com/kouiso/skillsheet-viewer/actions/runs/38365155695) で4条件は通過した。
そのrunはPlaywrightの90件も通過している。
この記録では別途手元の実画面へ低コントラストを入れた。

## 低コントラストを入れた検出試験

`e2e/fixture/contrast-synthetic-sheet.ts` の架空シートで撮影した。
人物・会社・案件・経歴はすべて架空で、実在の職務経歴書や既存の検証用フィクスチャからは作っていない。
表示上の基準月は2026-10だった。画面幅とテーマは次の4条件。

| テーマ | 幅 | 通常表示の計測要素 | 通常表示の違反 | 変更した見出しの検出 |
|---|---:|---:|---:|---:|
| light | 390 | 357 | 0 | 1 |
| light | 1280 | 366 | 0 | 1 |
| dark | 390 | 357 | 0 | 1 |
| dark | 1280 | 366 | 0 | 1 |

通常表示は未対応の背景も0件だった。
その後に最初のh1の文字色をbodyの背景色と同じにした。
`-webkit-text-fill-color` も同じ色にして実際の字色を変更した。
同じ `readContrastColors` と `requiredTextRatio` で再計測した。
4条件とも変更した見出しが違反として検出された。

```ts
await heading.evaluate((element) => {
  const color = getComputedStyle(document.body).backgroundColor;
  element.style.color = color;
  element.style.webkitTextFillColor = color;
});
const result = await page.evaluate(readContrastColors, undefined);
const violations = result.samples.filter(
  (sample) => contrastRatio(sample.color, sample.background)
    < requiredTextRatio(sample.fontSize, sample.fontWeight),
);
// 通常表示では0件。変更後は対象見出しの違反が1件。
```

この操作は検証用ブラウザのDOMだけに行った。DBや製品のCSSは変更していない。
計測結果は [result.json](contrast-evidence/result.json) に保存した。
画像はviewport先頭部分の通常表示と変更後。全ページの画像監査ではない。

| 条件 | 通常表示 | 変更後 |
|---|---|---|
| light 390 | [画像](contrast-evidence/light-390-normal.png) | [画像](contrast-evidence/light-390-mutated.png) |
| light 1280 | [画像](contrast-evidence/light-1280-normal.png) | [画像](contrast-evidence/light-1280-mutated.png) |
| dark 390 | [画像](contrast-evidence/dark-390-normal.png) | [画像](contrast-evidence/dark-390-mutated.png) |
| dark 1280 | [画像](contrast-evidence/dark-1280-normal.png) | [画像](contrast-evidence/dark-1280-mutated.png) |

## 継続検査

専用の使い捨てDBを準備してownerと文書境界を設定する。
共有DBで初期化スクリプトを実行しない。
CIと同じNodeと依存関係を使って次を実行する。

```sh
pnpm run build
pnpm test:playwright e2e/text-contrast.spec.ts e2e/contrast-render.spec.ts
```

検査器自体の低コントラスト・透明層・未対応背景の負例は
`e2e/contrast-render.spec.ts` にある。
描画済みの文字を対象とするため非表示の本文やPDFは別の検査対象になる。
