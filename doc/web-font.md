# Web用IBM Plexの再現可能な配信

Web UIはIBM Plex Sans JP normal 400/500/600/700、IBM Plex Mono normal 400/500/600を使う。`next/font/google` のbuild時取得から、正規npm配布物の静的CSS参照へ切り替えた。PDF用の既存Notoフォントは変更していない。

## 取得元・固定版・ライセンス

| npmパッケージ | 固定版 | 配布元metadataのGoogle版 | 内部font版 |
| --- | --- | --- | --- |
| `@fontsource/ibm-plex-sans-jp` | 5.3.1 | v8、2026-10-01 | Version 1.001 |
| `@fontsource/ibm-plex-mono` | 5.3.0 | v20、2025-09-16 | Version 2.3 |

[Fontsourceの配布案内](https://fontsource.org/fonts/ibm-plex-sans-jp/use)と、取得したパッケージ自身のmetadata/LICENSEを確認した。取得は既存のnpm registry経路のみ。禁止されていたGoogle CSSやその転送proxyを使っていない。package.jsonの完全固定版とpnpm-lock.yamlのSHA-512 integrityで管理し、Node 24.22.1 / pnpm 10.33.0の厳格engine・frozen installも確認する。

両方OFL-1.1。取得したLICENSE原文を変更せず `public/font/ibm-plex-sans-jp-license.txt` と `public/font/ibm-plex-mono-license.txt` に同梱する。ライセンスSHA-256はそれぞれ `61fa16c297719c907831191e15c242fad4f105ca160eeb90d789cd3e1f2cb7af`、`23b0a9d0c6d3f140a0b77e483c5cfa6bba574325ef5cb189ed9f2fec4884533f`。

## 表示契約

`app/font.css` が必要な7weightだけをimportする。JP各weightの123個、Mono各weightの5個のfont-faceとunicode-rangeをそのまま利用し、分割WOFF2を完全fontだと誤認しない。WOFF/WOFF2の改変・merge・subset生成は行わない。ブラウザは必要な文字範囲だけを同一originから取得する。外部font URLはCSSに含めない。

全参照binaryの内部full name・OS/2 weight・glyph集合・SHA-256をインストール済みNextのfontkitで検証した。JPは各weight 8224 code points、Monoは677 code points。各familyで全weightのglyph集合が一致し、UIの日本語とASCIIの合成サンプルを含む。

CSS変数 `--font-ibm-sans-jp` / `--font-ibm-mono`、display:swap、preloadなしを維持する。ロード中のArial fallback補正は、従来のNext 16.3.8のGoogle loaderが返したascent/descent/size-adjustを保持する。Googleの既知403は再試行していないため、その時点のCDN実体とのbyte一致を証明したとは扱わない。別書体へ置換したものではない。

## Workers UI実走で修正した境界

D1選択時の起動検証は、NeonのDATABASE_URLに代えてGateway URL・専用サービス認証値・アプリoriginを必須にする。従来のNeon選択時の必須条件は維持する。

workerdのfetchはredirect:errorをサポートしない。業務APIはredirect:manualで止め、3xxを結果不明として拒否する。リダイレクト先へ資格情報を送らず、結果不明の保存を自動再送しない。合成ローカル実走で検出し、301/302/303/307/308の負例も検証する。

検証ログ、font全binaryのmanifest、ブラウザのPC/390px画像、実走scriptは `.evidence/font-npm/` に保全する。実本番D1、既存credential、OAuth grant、deployやcloud設定はこの検証に使わない。

Next本番buildとOpenNext Workers buildは双方exit 0。Chromiumの閲覧/Builderを両runtime・PC/390pxで描画し、8画像すべてでfontのloadedと横overflowなしを確認。同一画面4組のruntime間画像はピクセル一致した。1つの隔離ローカルD1への交互更新・同時CAS・未認証拒否も成功。lint・型・全2462成功/既存8skipまで確認した。OpenNextのNode middlewareはexperimental警告があり、このローカル成功を本番対応保証とは扱わない。Workersでの全出力・Driveや実OAuth接続は別ゲートに残す。
