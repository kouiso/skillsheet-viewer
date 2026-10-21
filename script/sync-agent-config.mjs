#!/usr/bin/env node
/**
 * 開発 AI の共通設定を正本から各 AI の入口へ届け、ずれを止める（doc/ai-agent-config.md）。
 *
 * 1. 共通 Skill の正本 `.agents/skills/<name>/` から、Claude Code 用の `.claude/skills/<name>/` を生成する。
 *    Claude Code は `.claude/skills` しか探さず、Codex は `.agents/skills` しか探さない。
 *    片方を手で写すと内容がずれるので、正本を1か所に置いて生成物との差を lint で止める。
 *    シンボリックリンクにしないのは、Windows の既定の clone でリンクが1行のテキストになり
 *    Claude Code が Skill を読めなくなるため。
 * 2. `CLAUDE.md` が共通ルールの正本 `AGENTS.md` を import しているかを調べる。
 *    Claude Code は `CLAUDE.md` があると `AGENTS.md` を読まないので、import が消えると
 *    共通ルールが Claude にだけ届かなくなる。ここは自動で直さず、検知だけする。
 *
 * 使い方:
 *   node script/sync-agent-config.mjs          生成物を書き出す（何度実行しても同じ結果）
 *   node script/sync-agent-config.mjs --check  書き出さずに差分だけ調べ、差があれば exit 1
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { argv, cwd, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

export const SOURCE_DIR = join('.agents', 'skills');
export const TARGET_DIR = join('.claude', 'skills');
// 生成物の目印。これが無い `.claude/skills/<name>` は Claude 専用の手書き Skill として扱い、触らない。
export const GENERATED_MARKER = '<!-- generated-by: script/sync-agent-config.mjs';

/** Windows の autocrlf で改行だけが変わった時に、ずれと誤判定しないための正規化。 */
function normalizeEol(text) {
  return text.replace(/\r\n/g, '\n');
}

function toPosix(path) {
  return path.split(sep).join('/');
}

function markerLine(name) {
  return `${GENERATED_MARKER} from .agents/skills/${name}/SKILL.md. Edit the source, then run the script. -->`;
}

/**
 * SKILL.md の frontmatter の直後に目印を差し込む。
 * frontmatter は1行目から始まる必要があるため、先頭には置けない。
 */
export function renderSkillMarkdown(name, source) {
  const text = normalizeEol(source);
  const match = /^---\n[\s\S]*?\n---\n/.exec(text);
  if (!match) {
    throw new Error(
      `${toPosix(join(SOURCE_DIR, name, 'SKILL.md'))}: frontmatter（--- で囲んだ name / description）がない`,
    );
  }
  const head = match[0];
  return `${head}${markerLine(name)}\n${text.slice(head.length)}`;
}

async function listDirectories(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
}

async function listFiles(dir, base = dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full, base)));
    } else if (entry.isFile()) {
      files.push(relative(base, full));
    }
  }
  return files.sort();
}

async function readIfExists(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function isGeneratedSkill(skillDir) {
  const text = await readIfExists(join(skillDir, 'SKILL.md'));
  return text?.includes(GENERATED_MARKER) === true;
}

/**
 * 正本から期待される生成物を組み立て、今の `.claude/skills` と比べる。
 * 返り値の problems が空なら同期済み。
 */
export async function planSync(root) {
  const sourceRoot = join(root, SOURCE_DIR);
  const targetRoot = join(root, TARGET_DIR);
  const sourceNames = await listDirectories(sourceRoot);
  const targetNames = await listDirectories(targetRoot);

  /** @type {{ path: string, content: string }[]} */
  const writes = [];
  /** @type {string[]} */
  const removals = [];
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const conflicts = [];

  for (const name of sourceNames) {
    const sourceSkillDir = join(sourceRoot, name);
    const targetSkillDir = join(targetRoot, name);
    const sourceFiles = await listFiles(sourceSkillDir);
    if (!sourceFiles.includes('SKILL.md')) {
      problems.push(`${toPosix(join(SOURCE_DIR, name))}: SKILL.md がない`);
      continue;
    }
    const targetExists = targetNames.includes(name);
    if (targetExists && !(await isGeneratedSkill(targetSkillDir))) {
      conflicts.push(
        `${toPosix(join(TARGET_DIR, name))}: 手書きの Claude 専用 Skill と同名。どちらかの名前を変えるか、正本へ寄せてから消す`,
      );
      continue;
    }

    const expectedFiles = new Set(sourceFiles);
    for (const file of sourceFiles) {
      const source = await readFile(join(sourceSkillDir, file), 'utf8');
      const content = file === 'SKILL.md' ? renderSkillMarkdown(name, source) : normalizeEol(source);
      const targetPath = join(targetSkillDir, file);
      const current = await readIfExists(targetPath);
      if (current === null || normalizeEol(current) !== content) {
        writes.push({ path: targetPath, content });
        problems.push(
          `${toPosix(relative(root, targetPath))}: ${current === null ? '生成物がない' : '正本と内容が違う'}`,
        );
      }
    }
    if (targetExists) {
      for (const file of await listFiles(targetSkillDir)) {
        if (!expectedFiles.has(file)) {
          const stale = join(targetSkillDir, file);
          removals.push(stale);
          problems.push(`${toPosix(relative(root, stale))}: 正本に無いファイルが生成物に残っている`);
        }
      }
    }
  }

  // 正本を消した・改名した後に残った生成物。手書きの Skill は目印が無いので対象にならない。
  for (const name of targetNames) {
    if (sourceNames.includes(name)) continue;
    const targetSkillDir = join(targetRoot, name);
    if (await isGeneratedSkill(targetSkillDir)) {
      removals.push(targetSkillDir);
      problems.push(`${toPosix(join(TARGET_DIR, name))}: 正本が無い生成物が残っている`);
    }
  }

  return { writes, removals, problems, conflicts };
}

/**
 * `CLAUDE.md` の本文（frontmatter とコードブロックの外）に `@AGENTS.md` の import 行があるかを調べる。
 * Claude Code はコードスパンやコードブロック内の `@path` を import しないため、そこにある行は数えない。
 */
export function findAgentsImportProblem(claudeMd, agentsMdExists) {
  if (!agentsMdExists) return 'AGENTS.md: 共通ルールの正本がない';
  if (claudeMd === null) return null;
  let inFence = false;
  for (const line of normalizeEol(claudeMd).split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && line.trim() === '@AGENTS.md') return null;
  }
  return 'CLAUDE.md: `@AGENTS.md` の import 行がない（Claude Code に共通ルールが届かない）';
}

export async function checkInstructionImport(root) {
  const claudeMd = await readIfExists(join(root, 'CLAUDE.md'));
  const agentsMd = await readIfExists(join(root, 'AGENTS.md'));
  return findAgentsImportProblem(claudeMd, agentsMd !== null);
}

export async function applySync(plan) {
  for (const path of plan.removals) {
    await rm(path, { recursive: true, force: true });
  }
  for (const { path, content } of plan.writes) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf8');
  }
}

async function main() {
  const check = argv.includes('--check');
  const root = cwd();
  const plan = await planSync(root);
  const importProblem = await checkInstructionImport(root);
  const blockers = importProblem === null ? plan.conflicts : [...plan.conflicts, importProblem];
  if (blockers.length > 0) {
    for (const line of blockers) console.error(`✗ ${line}`);
    exit(1);
  }
  if (check) {
    if (plan.problems.length > 0) {
      console.error(
        '✗ .claude/skills の生成物が .agents/skills の正本とずれている。`node script/sync-agent-config.mjs` で直す',
      );
      for (const line of plan.problems) console.error(`  - ${line}`);
      exit(1);
    }
    console.log('✅ 共通 Skill の生成物は正本と一致し、CLAUDE.md は AGENTS.md を import している');
    return;
  }
  await applySync(plan);
  console.log(
    plan.problems.length === 0
      ? '✅ 変更なし（同期済み）'
      : `✅ ${plan.problems.length} 件を同期した\n  - ${plan.problems.join('\n  - ')}`,
  );
}

if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) {
  await main();
}
