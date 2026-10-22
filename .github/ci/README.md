# 共通CI入口

`task ci:fast` は命名、lint、型、既存の全単体テスト、ビルドを検査する。
従来のhealthcheckも同じ入口を使う。
既存lintに命名検査が含まれる場合だけ二重実行を省く。
lint が `&&` だけの鎖で、その1段が `./script/check-naming.sh` の時に「含まれる」とみなす。
`||` や `;` が混ざる、または命名検査の段が無い時は明示の命名検査を残す。

`task ci` は同じ検査の後に既存の隔離E2E入口を呼ぶ。
隔離DBの準備・橋渡し・後片付けの実装は変更しない。
準備済みのPlaywrightとheadlessを順に実行する。
Playwrightが失敗してもheadlessを実行し、最初の失敗コードを返す。
準備済みブラウザ検査の直接入口は既存の隔離preloadを必要とする。

Node 22.23.4、pnpm 10.33.0、Bash、Python 3と固定依存が必要となる。
PDFの検査ではクラウドと同じPDFシステムツールが必要となる。
E2Eでは既存の隔離環境・認証用の設定とChromiumを使う。
依存やブラウザの導入、DBの実起動を契約テストは行わない。

クラウドのrequired check名、matrix、docs-only判定、secret条件を保持する。
PDFのシステム依存、E2Eのalways条件、証跡と後片付けも保持する。
既存testスクリプトの3つのVitest設定を省かない。
両E2Eのbuildも保持する。DBの状態を含む入力の一致は実証していない。
Next.jsのビルドは[既存CLI](https://nextjs.org/docs/app/api-reference/cli/next)を使う。

この変更はCI入口だけを対象とする。
アプリ、データ、承認、CAS、公開処理の実装には変更を加えない。

`python3 .github/ci/test_entry.py` は一時fixtureで実入口を動かす。
アプリ・実DB・実データを読み込まず、順序と失敗伝播を検査する。
実アプリ、PDF、ブラウザ、DB、公開の成功を表す検査ではない。
