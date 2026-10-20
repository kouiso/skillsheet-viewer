import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  applySync,
  checkInstructionImport,
  findAgentsImportProblem,
  GENERATED_MARKER,
  planSync,
  renderSkillMarkdown,
} from './sync-agent-config.mjs';

const SKILL = '---\nname: sample\ndescription: サンプル\n---\n\n# 本文\n';

let root: string;

async function put(path: string, content: string) {
  await mkdir(join(root, path, '..'), { recursive: true });
  await writeFile(join(root, path), content, 'utf8');
}

async function sync() {
  await applySync(await planSync(root));
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sync-agent-config-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('renderSkillMarkdown', () => {
  it('frontmatter を1行目に残したまま、その直後に生成物の目印を入れる', () => {
    const rendered = renderSkillMarkdown('sample', SKILL);
    expect(rendered.startsWith('---\nname: sample\n')).toBe(true);
    expect(rendered.split('\n')[4]).toContain(GENERATED_MARKER);
    expect(rendered.endsWith('\n# 本文\n')).toBe(true);
  });

  it('frontmatter が無い正本は止める（Claude Code が Skill として読めないため）', () => {
    expect(() => renderSkillMarkdown('broken', '# 本文だけ\n')).toThrow('frontmatter');
  });
});

describe('planSync / applySync', () => {
  it('正本から生成し、2回目は何も変えない（冪等）', async () => {
    await put('.agents/skills/sample/SKILL.md', SKILL);
    await put('.agents/skills/sample/reference/note.md', '補足\n');

    const first = await planSync(root);
    expect(first.problems).toHaveLength(2);
    await applySync(first);

    expect(await readFile(join(root, '.claude/skills/sample/reference/note.md'), 'utf8')).toBe('補足\n');
    const second = await planSync(root);
    expect(second.problems).toEqual([]);
    expect(second.writes).toEqual([]);
  });

  it('生成物を手で直すと検知する', async () => {
    await put('.agents/skills/sample/SKILL.md', SKILL);
    await sync();
    await put('.claude/skills/sample/SKILL.md', `${renderSkillMarkdown('sample', SKILL)}手で足した行\n`);

    const plan = await planSync(root);
    expect(plan.problems).toEqual(['.claude/skills/sample/SKILL.md: 正本と内容が違う']);
  });

  it('改行が CRLF に変わっただけではずれと見なさない（Windows の autocrlf）', async () => {
    await put('.agents/skills/sample/SKILL.md', SKILL.replace(/\n/g, '\r\n'));
    await sync();
    await put('.claude/skills/sample/SKILL.md', renderSkillMarkdown('sample', SKILL).replace(/\n/g, '\r\n'));

    expect((await planSync(root)).problems).toEqual([]);
  });

  it('正本を消した後の生成物と、正本から消えた補足ファイルを片付ける', async () => {
    await put('.agents/skills/sample/SKILL.md', SKILL);
    await put('.agents/skills/sample/old.md', '古い\n');
    await put('.agents/skills/gone/SKILL.md', SKILL.replace('sample', 'gone'));
    await sync();
    await rm(join(root, '.agents/skills/gone'), { recursive: true });
    await rm(join(root, '.agents/skills/sample/old.md'));

    const plan = await planSync(root);
    expect(plan.problems.sort()).toEqual([
      '.claude/skills/gone: 正本が無い生成物が残っている',
      '.claude/skills/sample/old.md: 正本に無いファイルが生成物に残っている',
    ]);
    await applySync(plan);
    expect((await planSync(root)).problems).toEqual([]);
  });

  it('目印の無い Claude 専用 Skill には触らず、同名の正本は衝突として止める', async () => {
    await put('.claude/skills/claude-only/SKILL.md', '---\nname: claude-only\ndescription: 専用\n---\n');
    await put('.claude/skills/clash/SKILL.md', '---\nname: clash\ndescription: 手書き\n---\n');
    await put('.agents/skills/clash/SKILL.md', SKILL.replace('sample', 'clash'));

    const plan = await planSync(root);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]).toContain('.claude/skills/clash');
    expect(plan.removals).toEqual([]);
    expect(plan.writes).toEqual([]);
    expect(await readFile(join(root, '.claude/skills/clash/SKILL.md'), 'utf8')).toContain('手書き');
  });

  it('SKILL.md の無い正本は問題として報告する', async () => {
    await put('.agents/skills/empty/README.md', 'x\n');
    expect((await planSync(root)).problems).toEqual(['.agents/skills/empty: SKILL.md がない']);
  });
});

describe('findAgentsImportProblem / checkInstructionImport', () => {
  it('frontmatter の後の `@AGENTS.md` 行を import と認める', () => {
    expect(findAgentsImportProblem('---\nalwaysApply: true\n---\n\n@AGENTS.md\n\n## 専用\n', true)).toBeNull();
  });

  it('import 行が消えた CLAUDE.md を止める（Claude Code は CLAUDE.md があると AGENTS.md を読まない）', () => {
    expect(findAgentsImportProblem('## 専用だけ\n', true)).toContain('@AGENTS.md');
  });

  it('コードブロックや文中の `@AGENTS.md` は import と数えない', () => {
    expect(findAgentsImportProblem('```\n@AGENTS.md\n```\n', true)).not.toBeNull();
    expect(findAgentsImportProblem('詳しくは `@AGENTS.md` を見る\n', true)).not.toBeNull();
  });

  it('CRLF の CLAUDE.md でも import を認める', () => {
    expect(findAgentsImportProblem('@AGENTS.md\r\n## 専用\r\n', true)).toBeNull();
  });

  it('AGENTS.md が無ければ CLAUDE.md の有無に関係なく止める', () => {
    expect(findAgentsImportProblem(null, false)).toContain('AGENTS.md');
    expect(findAgentsImportProblem('@AGENTS.md\n', false)).toContain('AGENTS.md');
  });

  it('リポジトリの実ファイルを読んで判定する', async () => {
    await put('AGENTS.md', '# 共通\n');
    expect(await checkInstructionImport(root)).toBeNull();
    await put('CLAUDE.md', '## 専用だけ\n');
    expect(await checkInstructionImport(root)).toContain('CLAUDE.md');
    await put('CLAUDE.md', '@AGENTS.md\n');
    expect(await checkInstructionImport(root)).toBeNull();
  });
});
