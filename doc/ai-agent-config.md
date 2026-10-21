# 開発 AI の共通ルールと Skill の置き場所

どの開発 AI に切り替えても、同じルールと同じ Skill が届くようにするための取り決め。
正本を1か所に決め、AI ごとの入口はそこから参照か生成で作る。手で写した複製は置かない。

## 区分

| 種類 | ファイル | 区分 | 直す場所 |
| --- | --- | --- | --- |
| 共通ルール | `AGENTS.md` | 正本 | ここを直す |
| 共通ルール（Next.js 管理部分） | `AGENTS.md` の `BEGIN:nextjs-agent-rules` 〜 `END` | Next.js の生成物 | 触らない（`next dev` が書き戻す） |
| プロジェクト指針 | `prompt/prompt.md` | 正本（`AGENTS.md` から参照） | ここを直す |
| 前提ドキュメント | `doc/` | 正本 | ここを直す |
| Claude Code 用ルール | `CLAUDE.md` | Claude 専用。先頭で `@AGENTS.md` を import する | Claude だけの話（code-review-graph）だけ書く |
| 共通 Skill | `.agents/skills/<name>/SKILL.md` | 正本 | ここを直す |
| Claude Code 用 Skill（共通分） | `.claude/skills/<name>/`（目印コメント付き） | 生成物 | 正本を直して `node script/sync-agent-config.mjs` |
| Claude Code 専用 Skill | `.claude/skills/{debug-issue,explore-codebase,refactor-safely,review-changes}/` | Claude 専用（code-review-graph の導入時に生成） | そのまま |
| Claude Code の権限・hook | `.claude/settings.json` | Claude 専用 | 共通化しない |
| MCP サーバー | `.mcp.json` | Claude 専用 | 共通化しない（認証情報は置かない） |
| GitHub Copilot 用ルール | `.github/copilot-instructions.md`、`.github/instructions/*.instructions.md` | Copilot 専用 | 共通化しない |

`.claude/rules/` と既存の同期スクリプトは無かった（2026-10-21 時点）。

## 優先順位

1. 共通ルールは `AGENTS.md` だけに書く。AI 専用ファイルには、その AI にしか無い仕組みの話だけを足す。
2. AI 専用ファイルと `AGENTS.md` が食い違ったら、`AGENTS.md` を正として AI 専用ファイルを直す。
3. 参照は「AI 専用 → 共通」の一方向だけ。`AGENTS.md` から `CLAUDE.md` を import しない。

Claude Code は `CLAUDE.md` があると `AGENTS.md` を読まない。そのため `CLAUDE.md` の import 行が要になる。
消えると共通ルールが Claude にだけ届かなくなるので、`pnpm lint` で検知している。

## AI ごとの入口と確認結果

確認日 2026-10-21。「実測」は下の確認方法で、利用者のグローバル設定を外した状態（`HOME` を空ディレクトリに差し替え）で見た結果。

| AI（版） | ルールの入口 | Skill の入口 | 確認 |
| --- | --- | --- | --- |
| Claude Code 2.1.291 | `CLAUDE.md` → `@AGENTS.md` | `.claude/skills/`（生成物＋専用） | 実起動で確認（下の注記） |
| Codex CLI 0.155.1 | `AGENTS.md` | `.agents/skills/` | 実測（`codex debug prompt-input`） |
| Devin CLI 3000.10.31 | `AGENTS.md` と `CLAUDE.md` | `.agents/skills/` と `.claude/skills/` | 実測（`devin rules list` / `devin skills list`） |
| OpenCode 1.18.15 | `AGENTS.md` | `.agents/skills/` と `.claude/skills/`（同名は1つにまとめる） | 実測（`opencode debug skill`） |
| Antigravity 1.11.5（GUI） | `AGENTS.md` | `.agents/skills/` | 未検証（公式文書でだけ確認） |
| GitHub Copilot CLI 1.0.101 | `AGENTS.md`、`CLAUDE.md`、`.github/copilot-instructions.md` | `.agents/skills/` と `.claude/skills/`（同名は1つにまとめる） | 実測（`copilot instruction list` / `copilot skill list`） |
| Gemini CLI / Cursor | — | — | 未導入のため入口を作っていない |

公式文書:
[Claude Code memory](https://code.claude.com/docs/en/memory)、
[Claude Code skills](https://code.claude.com/docs/en/skills)、
[Codex skills](https://learn.chatgpt.com/docs/build-skills)、
[Devin CLI skills](https://docs.devin.ai/cli/extensibility/skills/overview)、
[Devin CLI read_config_from](https://docs.devin.ai/cli/reference/configuration/read-config-from.md)、
[Antigravity skills](https://antigravity.google/docs/skills)、
[Antigravity rules](https://antigravity.google/docs/rules?tab=ide)、
[Copilot CLI skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-skills)、
[Copilot CLI instructions](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions)
（いずれも 2026-10-21 参照）。

### 確認方法

```bash
H=$(mktemp -d) && mkdir -p "$H/.codex"                 # グローバル設定を外す
HOME=$H CODEX_HOME=$H/.codex codex debug prompt-input  # Codex に渡る指示と Skill 一覧（モデルは呼ばない）
HOME=$H XDG_CONFIG_HOME=$H/.config devin rules list
HOME=$H XDG_CONFIG_HOME=$H/.config devin skills list
HOME=$H XDG_CONFIG_HOME=$H/.config opencode debug skill
HOME=$H XDG_CONFIG_HOME=$H/.config copilot instruction list
HOME=$H XDG_CONFIG_HOME=$H/.config copilot skill list
```

## 対応しきれていないこと

- **Devin CLI では共通 Skill が2つずつ並ぶ。** Devin は `.agents/skills` と `.claude/skills` の両方を読み、同名の実体が別ファイルだと `/agents:<name>` と `/claude:<name>` に分けて出す。中身は同じ。
  - シンボリックリンクなら Devin は1つにまとめるが、Windows の既定の clone ではリンクがテキストになり Claude Code が読めなくなるため使わない。
  - `.devin/config.json` に `{"read_config_from": {"claude": false}}` を置けば重複は消える。ただし Devin から `CLAUDE.md` の code-review-graph の説明・専用 Skill・`.mcp.json` も見えなくなるため入れていない。
- **Antigravity は実起動で確かめていない。**
- **Copilot CLI の Skill は7つ並ぶ。** 共通 Skill 3つは `.agents` と `.claude` の両方にあるが1つずつにまとまり、残り4つは Claude 専用 Skill。`.claude/skills/` を外しても共通 Skill 3つは `.agents/skills/` から読まれた。
- **Claude Code はグローバル設定を外さずに確かめた。** ログイン情報が `HOME` にあり、外すと起動できないため。
  - 対話起動して `/memory` に `CLAUDE.md` と `L AGENTS.md @-imported` が並ぶこと、`InstructionsLoaded` フックに `AGENTS.md`（`load_reason: include`）が届くことを見た。import 行を消すと `AGENTS.md` は届かなくなった。
  - 同じ名前の Skill が `~/.claude/skills/` にあると、Claude Code はそちらを優先する（[公式](https://code.claude.com/docs/en/skills)）。その場合はこのリポジトリの共通 Skill が使われない。
- **Copilot の `.github/copilot-instructions.md` 系は共通ルールと別に残している。** Copilot は `AGENTS.md` も読むため共通ルールは届く。専用ファイルの中身の整理はこの取り決めの範囲外。

## 更新の手順

- 共通ルール: `AGENTS.md` を直す。Next.js の管理部分には触らない。
- 共通 Skill を足す・直す: `.agents/skills/<name>/SKILL.md` を書き、`node script/sync-agent-config.mjs` を実行して生成物も一緒にコミットする。
- 共通 Skill を消す・改名する: 正本を消してからスクリプトを実行すると、目印付きの生成物も消える。
- Claude だけの Skill: `.claude/skills/<name>/` に目印なしで置く。正本と同名にするとスクリプトが止まる。
- ずれの検知: `pnpm lint`（CI の lint も同じ）が `node script/sync-agent-config.mjs --check` を通す。
