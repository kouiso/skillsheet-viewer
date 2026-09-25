---
name: skillsheet-narrative-update
description: Use when rewriting skill-sheet narrative fields or preparing their Neon and private Markdown synchronization. Preserve original claims separately from independent evidence, bind owner approval to exact field hashes, and use the v12 document CAS boundary. Triggers on script/apply-project-narrative.ts, block-write.ts, project blocks, skills blocks, and requests to rewrite project narratives.
---

# 案件本文の書き換えと DB 反映

このリポジトリは **public**。案件本文・顧客名・実在の案件タイトル・資格情報をここへ書かない。
データの正本は Neon、文章の同期先は private 側の `skill-sheet/skillsheet.md`。
このスキルには手順だけを置き、原文・候補・根拠・承認は永続的な私有領域に保存する。

## 1. 原文・本人申告・独立した証拠・AI候補を分ける

**リポジトリで見つからないことは、本人が経験していない証拠ではない。**
未発見の技術・数値・成果・担当を削除したり弱めたりせず、原文を保持し、該当する変更候補だけを保留する。
新しい事実を足すときも、一般仕様とその案件で実装した事実を混同しない。

| 主張 | 調べる一次情報 | 見つからない場合 |
|---|---|---|
| 使用技術 | 依存定義・import・当時の設定 | 本人申告として原文を保持し、独立検証は未確認と記録 |
| 構成・数値・測定対象 | IaC・計測ログ・当時のPR | 対象・単位・数値を変えず、補足候補のみ保留 |
| 選定理由 | 設計文書・ADR・本人の既回答 | 推測で理由を追加せず、原文を保持 |
| 担当範囲 | 本人回答・履歴・設計資料 | git authorだけで本人の実績を否定しない |

shallow cloneや参画期間を含まない履歴で、担当の不存在を断定しない。
本人裁定（2026-09-21、旧裁定を置き換え）: プロジェクトのリポジトリにある成果は、
git の著者が別人でもすべて本人の実績として書く。データサイエンス・モデル研究側
（集約アルゴリズム、差分プライバシー、スコアリング設計、評価ルーブリック）も区別しない。
以前の「データサイエンス側は主語なしで書く」二層構造は廃止。
「指揮した」「リードした」「チームに作らせた」とは書かず、設計・実装した、と書く。
「一部実装」のように自分の担当を狭める書き方もしない。
参画期間より後のコミットや別リポジトリの成果も、そのプロジェクトのものなら同じ扱い。
本人の帰属裁定は保持し、新規作成・単独担当・選定理由・成果を証拠不足だけで弱めない。
技術的な弱点を見つけても、別の架空実績で埋めず、原文と改善候補を分ける。

## 2. 候補の作成と本人承認

主語・原因・担当範囲・選定理由・測定対象・単位・時制をbefore/afterで照合する。
既存の500〜600字の執筆方針は保持するが、字数を埋めるための事実追加はしない。
要約や代表案件は全文の入口として追加する候補であり、全文の置換や省略にしない。
本人の既回答を再質問せず、未回答の事実に関係する候補だけを保留する。

承認資料は変更前・変更後・理由・根拠種別・未確認部分を分けて示す。
承認を `owner + sheet UUID + project/company UUID + field + before/after hash + 根拠元content hash` に結びつける。
タイトルや会社名の文字列一致だけで対象を選ばない。
JSONは共通canonical処理とSHA-256、Markdown対象fieldはLF・UTF-8のSHA-256を使う。
異形式のwhole-file hash同士を同一内容として比べない。
本人がこの差分を承認するまでDB・Markdownへ反映しない。承認後に根拠・beforeが変わればstaleとして該当候補の公開を止める。

## 3. 書込み前の安全条件

Vercelのproject/deploy/alias/SHAとNeonのproject/branch/database/owner/sheetを、資格情報を表示せず同定する。
ローカルの接続文字列や既知URLだけで本番同定済みとは扱わない。
本番対象、限定runtimeの権限、backupの復元、退避buildが未確認なら本番切替は行わない。

`read_snapshot`でsheetId/title/blocks/revision/validationを一体取得する。
revisionは10進文字列、0も有効。保存はsheetIdとexpectedRevisionの完全一致CASを必須にする。
不明type・壊れたJSON・未対応key・期間投影不一致はrawを保持して編集不可にし、削って検査を通さない。
`src/db/block`の型と意味往復、`document-contract`の検査を通し、本人入力の本文・期間を勝手に正規化しない。

旧`block-write`やタイトル照合のwriterが停止されていれば、停止を解除して使わない。
文書サービス・限定DB関数・承認journalへの移行が済むまで反映は未完了として扱う。
基表の直接UPDATEや`updated_at`だけの更新でCASを代用しない。
編集タブを閉じることもCASの代用にはならず、ユーザーに閉じてもらったことを安全性の証拠にしない。

## 4. Neon → Markdown の同期と復旧

ownerだけが読書きできる永続私有領域にbefore全文と復旧情報を保存する。
change IDごとにappend-only journalへ `approved / db-applied / sync-pending / synced / reverted` を記録する。
承認とbeforeをdurable化してから、DB CAS、成功後のMarkdown反映の順で実行する。
要約・profile.title・strengthsも同じ契約に含める。

| 再開時の読戻し | 実施する処理 |
|---|---|
| DB after / Markdown before | DBへ再書込みせずMarkdownだけ反映 |
| 双方after | no-op、同期確認を記録 |
| 双方before | 承認済み差分をDB CAS→Markdownの順で反映 |
| その他 | 後続変更を守って停止し、該当差分を再照合 |

rollbackは今回のafterと一致するときだけ、本人承認と対象確認を経てbeforeへCASする。revisionは増やす。
応答喪失時の同値readbackは「現在DBに同内容がある」の確認であり、この要求が保存した証明とはしない。
復旧のためでも未承認の削除・パスワード変更・資格情報失効は行わない。

## 5. 反映後の確認

固定秒数の待機ではなく、DBのrevision・意味hashとMarkdownの対象field hashを読戻す。
文書全体の型・未対応key・block順序・owner境界・対象UUIDを確認する。
同じrevision/hashと固定基準月でWeb/PDFを検証し、全文・全技術・全会社経歴が残っていることを確かめる。
期間・hidden変更は経験集計への増減を差分として示し、派生値をDBへ逆書込みしない。
本文の本人承認、DB反映、Markdown同期、Web/PDF確認を別々に記録し、どれか欠ければ反映完了とは言わない。
