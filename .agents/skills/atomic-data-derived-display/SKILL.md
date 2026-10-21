---
name: atomic-data-derived-display
description: Use when designing or reviewing how data is stored — a schema, a DB column, a JSON field, a config file, a form the user types into, or a migration. Bans storing pre-registered combinations, annotations, and relationships inside a value. One fact per entry; composition happens at display time. Triggers on parenthetical detail baked into a name, values joined by + / ・ 、, a status embedded in a date, or a label embedded in a title.
---

# 組み合わせを人間に事前登録させるな

**保存するのは原子的な値ひとつ。組み合わせ・注釈・関係は、表示するときにロジックで組む。**

Origin: 2026-08-28 skillsheet-viewer。スキルシートの使用技術を
`GCP (BigQuery, Cloud Scheduler, Secret Manager, IAM, Workload Identity Federation)`
という 1 本の文字列で DB に入れる設計を通してしまい、kouiso が
「言語やライブラリの追記がだるい」「この組み合わせって事前に登録せなあかんわけでしょ？
それだとちょっとナンセンスな設計」と指摘した。全案件の tech 配列を作り直す手戻りになった。

## 何がアカンのか

複合値は、**書く側に「既存の文字列を編集する」作業を強制する**。
1 個足すだけなのに、括弧の中身を読んで、区切り文字を合わせて、順番を考えることになる。
追記のコストが O(1) から O(既存の長さ) に上がる。だから人は追記をやめる。データが腐る。

さらに悪いのは、**同じ実体が別々の文字列に分裂する**こと。
`GCP (BigQuery)` と `GCP (Cloud Scheduler)` と `GCP` は、機械から見て別物になる。
数える・絞り込む・並べ替える・重複を消す、が全部できなくなる。

「表示がそうなっとるから保存もそうする」は逆。**表示の都合を保存に持ち込むと、
保存が表示に縛られて、表示を変えた瞬間にデータ移行が要る。**

## 判定

保存しようとしている値について問う。**ひとつでも yes なら分解する。**

| 問い | yes の例 |
|---|---|
| 括弧の中に、別の実体の名前が入っとらんか | `GCP (BigQuery, IAM)` |
| 区切り文字で 2 つの実体をつないどらんか | `pnpm + Turborepo` / `React・Next.js` |
| 値の中に説明・分類・肩書きが混ざっとらんか | `Sanity (ヘッドレス CMS)` / `Q社（自社サービス事業会社）` |
| 値の中に状態が埋まっとらんか | `2025.11〜現在` / `田中（退職）` |
| 同じ実体が、別の行では別の綴りで入っとらんか | `NestJS` と `Nest.js` |

`Next.js 15` のようにバージョンが製品名の一部になっとるものと、
公式名にそもそも括弧が入っとるものだけが例外。迷ったら分解する。

## 直し方

1. **原子に割る。** `GCP (BigQuery, IAM)` → `GCP` / `BigQuery` / `IAM` を同じ配列の兄弟に。
2. **説明は捨てるか、既にある文章欄へ逃がす。** 説明は実体やない。
   `Sanity (ヘッドレス CMS)` の「ヘッドレス CMS」は、たいてい本文に既に書いてある。
3. **状態は別の値にする。** 「〜現在」は終了日を空にして表現し、
   「現在」という文字列を日付欄に入れへん。
4. **組み合わせが要るなら表示側で組む。** カテゴリでまとめる、親子で括る、
   代表を先頭に出す。全部レンダラの仕事。

## 逃げ道を塞ぐ

**親子テーブルを足して「関係を登録できるようにする」のは、同じ問題の引っ越し。**
登録の手間が別の場所に移るだけで、人が事前に組み合わせを決める構造は残る。
既存のグルーピング（カテゴリ、タグ、日付順）で足りるなら、それで足りる。

**表示のためにフィールドを足すのも禁止。** 表示の判断は、保存済みの値から
その場で導出できる。導出できひんのなら、それは表示の都合であって事実やない。

## 検知

- 値の中に `(` `（` `+` `・` があり、中身が別の実体の名前 = VIOLATION。
- 同じ実体を指す文字列が 2 通り以上あり、正規化されてへん = VIOLATION。
- 表示を変えるためにスキーマ変更が要る = 設計が表示に縛られとる。
