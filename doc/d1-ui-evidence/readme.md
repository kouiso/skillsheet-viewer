# 共通D1 UIの合成画面証跡（#598）

対象ソースは [`6cf7eef8b70417e9e1753af821f565908f4f4bbd`](https://github.com/kouiso/skillsheet-viewer/commit/6cf7eef8b70417e9e1753af821f565908f4f4bbd)。2026-10-22、クラウド内のNext production buildとOpenNext workerd UIを、同じ隔離ローカルD1へ接続してChromiumで撮影した。

合成の**空文書**だけを使っている。実経歴本文の配置や各出力の完成を示す画像ではない。PNGに端末のアドレスバーやmetadataは含まれず、認証情報・環境値・接続先・ローカルパス・個人情報を公開しない。テストの生ログや内部設定はこのフォルダへ入れていない。

## 画面

| 画面 | Next PC 1440px | Next 390px | Workers PC 1440px | Workers 390px |
| --- | --- | --- | --- | --- |
| 閲覧 | [画像](next-viewer-1440.png) | [画像](next-viewer-390.png) | [画像](workers-viewer-1440.png) | [画像](workers-viewer-390.png) |
| Builder | [画像](next-builder-1440.png) | [画像](next-builder-390.png) | [画像](workers-builder-1440.png) | [画像](workers-builder-390.png) |

8画面でIBM Plex Sans JP/Monoのloaded、横スクロールなし、ブラウザ例外なし、外部通信なしを確認した。同一画面のruntime間4組はピクセル一致した。ファイルごとのSHA-256と検証範囲は[検証記録](verification.json)にある。

同じ隔離D1へのNext→Workersの更新反映、Workers→Nextの更新反映、同一版の同時保存で1件だけ成功、未認証Builder拒否も確認した。画面はAPI更新の前に撮影しており、実環境の変更ではない。

## 対象SHAのリモートチェック

- [Vercel自動Preview](https://vercel.com/kouisos-projects/skillsheet-viewer/EEkfv7gqSC6Wkbv1zis78yvVURq2)：`success` / `READY`。Git連携の自動処理で、手動deployは実行していない。SHAとbranchの一致をmetadataで確認し、アプリの実URLへはアクセスしていない。
- [Deploy Smoke](https://github.com/kouiso/skillsheet-viewer/actions/runs/39814272501)：`completed / skipped`。jobがproductionのみを対象とし、今回のPreviewは対象外。
- 本体CIはPRまたはmain pushで起動する。feature branch単独pushでPRも未作成のため未起動。`skipped`や未起動をCI緑とは扱わない。

当該SHAの失敗チェックは観測されていない。workflow実行・rerun・PR作成は行っていない。ローカルのlint・型・両buildと2462成功/既存8skipは、リモートCI完了とは別の証跡である。

本番D1切替、全データ移行、既存認証継続、実OAuth/Drive、WorkersでのPDF/XLSX/DOCX操作、監視・逆同期/rollbackは、このフォルダで完了を主張する対象ではない。
