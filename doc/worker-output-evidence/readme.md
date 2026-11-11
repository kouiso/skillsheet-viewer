# Workers実ランタイム出力検証の証跡（#607）

#598 の子。合成データだけの隔離ローカルD1に対し、Next production（`next start`）とOpenNext workerd（`wrangler dev` / `.open-next/worker.js`）の両ランタイムから、同一文書・同一基準月（2026-11）の出力を実ブラウザ（Chrome 157）と実routeで実行した結果。2026-11-11 に main 取り込み後の木（next 16.4.2 / wrangler 4.157.0）で撮り直した。

合成の**架空デモ文書**（`架空出力検証シート` / `buildConsoleDemoBlocks`）だけを使っている。実経歴本文は含まない。認証情報・環境値・接続先・ローカルパス・個人情報は公開しない。

## 検出したランタイム互換バグと最小修正

- **症状（修正前）**: workerd が全リクエストで `Unexpected loadManifest(/.next/server/preview-props.json)` を投げ 500 を返した。`@opennextjs/cloudflare@1.20.10` の loadManifest ビルド時インライン化に `preview-props.json` が含まれず、Next 16.4 の NextNodeServer コンストラクタで必ず失敗した。`next start`（Node 実ランタイム）では manifest を disk から読むため無事だった。
- **修正**: `@opennextjs/cloudflare` を `1.20.10` → `1.20.13` に bump。上流修正 [opennextjs-cloudflare#1356](https://github.com/opennextjs/opennextjs-cloudflare/pull/1356)（1.20.11）で preview-props.json のインライン化が入った。選定時（11-02）は 1.20.14 以降が `.npmrc` の7日待ちに届かず見送った。
- 修正前のエラー抜粋: [worker-error-before-fix.log](worker-error-before-fix.log)（2026-11-11 に 1.20.10 で再採取。ローカルパスは伏せた）。修正後の全検査結果は [verification.json](verification.json)。

## 検証済み（両ランタイム）

- XLSX 全文・要約 / DOCX 全文: 実route `GET /api/sheet/export-{xlsx,docx}` で 200、MIME（spreadsheetml / wordprocessingml）、`attachment; filename*=`、`Cache-Control: no-store`。zip 内部 XML を開いて日本語期待本文（氏名・案件名・技術語）を点検 — 欠落なし・異常重複なし。要約版は `（要約版）.xlsx` ファイル名。
- PDF 全文・要約: 実ブラウザで `/view/db/<id>` を開きダウンロードボタンを押して生成。pdfjs で本文を抽出して期待文字列を点検。要約版に `（要約版）` あり。
- 拒否系: `edition=bogus`→400、docx の `edition=digest`→400、非UUID `id`→400、未知UUID `id`→404、未認証→401（エラー本文に文書本文を含まない）。
- 出力前後で revision 不変（0→0、CASの read 確認）。ブラウザの外部リクエスト 0 件。サーバーログに文書本文なし。

## 画面

| 画面 | Next PC 1440px | Workers PC 1440px |
| --- | --- | --- |
| 閲覧 | [画像](next-viewer-1440.png) | [画像](worker-viewer-1440.png) |
| Excel/Wordメニュー | [画像](next-menu-office-1440.png) | [画像](worker-menu-office-1440.png) |
| 要約版メニュー | [画像](next-menu-digest-1440.png) | [画像](worker-menu-digest-1440.png) |
| SP 390px 閲覧 | [画像](next-viewer-390.png) | [画像](worker-viewer-390.png) |
| SP 390px メニュー | [画像](next-menu-390.png) | [画像](worker-menu-390.png) |

## 未実行・対象外

- 本番環境・実デプロイ間のE2E、本番D1・実データへの接続（合成D1のみ）。
- 2026-11-02 の木（ベースコミット a88020b）では macOS で `script/pdf-layout-workflow.test.ts` / `script/history-capacity-monitor-workflow.test.ts` が各1件落ちていたが、main 取り込み後の head（2026-11-11）では `pnpm test` 3構成すべて通過している。
