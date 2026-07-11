import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type Block, blocksToMarkdown, splitMarkdownIntoBlocks } from './blocks';
import { isGitHubSeedConfigured } from './skillsheet';

// 注意: skillsheet.ts の getOwnerId は export されておらず（module-private）、
// getSkillSheet/saveSkillSheetBlocks 経由でしか到達できない。これらは getDb() で
// 実 DB へ接続するため、ネットワーク/DB なしの単体テストでは到達不能。
// よってここでは到達可能な純粋関数（blocks.ts の split/join）の決定的な
// round-trip を検証する。env は決定性のため明示セットするが、DB へは接続しない。
beforeEach(() => {
  process.env.SESSION_SECRET = 'test-session-secret-deadbeef';
  process.env.SKILLSHEET_OWNER_ID = 'test-owner-id';
});

describe('isGitHubSeedConfigured', () => {
  const GH_KEYS = ['GITHUB_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPO', 'VITE_GITHUB_TOKEN', 'VITE_GITHUB_OWNER', 'VITE_GITHUB_REPO'];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of GH_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of GH_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('GITHUB_* が未設定なら false（未設定は正常系・seed をスキップする合図）', () => {
    expect(isGitHubSeedConfigured()).toBe(false);
  });

  it('TOKEN/OWNER/REPO が全て揃うと true', () => {
    process.env.GITHUB_TOKEN = 't';
    process.env.GITHUB_OWNER = 'o';
    process.env.GITHUB_REPO = 'r';
    expect(isGitHubSeedConfigured()).toBe(true);
  });

  it('一つでも欠けると false（REPO 欠落）', () => {
    process.env.GITHUB_TOKEN = 't';
    process.env.GITHUB_OWNER = 'o';
    expect(isGitHubSeedConfigured()).toBe(false);
  });

  it('VITE_ プレフィックスの env でも認識する', () => {
    process.env.VITE_GITHUB_TOKEN = 't';
    process.env.VITE_GITHUB_OWNER = 'o';
    process.env.VITE_GITHUB_REPO = 'r';
    expect(isGitHubSeedConfigured()).toBe(true);
  });
});

// MarkdownBlockData[] を order 付きの Block[] へ変換するヘルパ（blocksToMarkdown 用）。
function toBlocks(segments: { markdown: string }[]): Block[] {
  return segments.map((data, order) => ({ id: `b${order}`, type: 'markdown', order, data }));
}

describe('splitMarkdownIntoBlocks / blocksToMarkdown', () => {
  it('round-trip: split → join で元の文書に一致する（無損失）', () => {
    const markdown = [
      '# タイトル',
      '',
      'リード文。',
      '',
      '## セクション A',
      '',
      '本文 A。',
      '',
      '### サブ A-1',
      '',
      '本文 A-1。',
      '',
      '<details>',
      '<summary>折りたたみ</summary>',
      '',
      '中身。',
      '',
      '</details>',
    ].join('\n');

    const segments = splitMarkdownIntoBlocks(markdown);
    const restored = blocksToMarkdown(toBlocks(segments));
    expect(restored).toBe(markdown);
  });

  it('レベル2〜4の見出しと <details> でブロック境界を作る', () => {
    const markdown = ['冒頭', '## A', 'a本文', '### B', 'b本文', '<details>', 'd本文'].join('\n');
    const segments = splitMarkdownIntoBlocks(markdown);
    const texts = segments.map((s) => s.markdown);
    expect(texts).toEqual(['冒頭', '## A\na本文', '### B\nb本文', '<details>\nd本文']);
  });

  it('境界（##）が連続しても各見出しが独立ブロックになる', () => {
    const markdown = ['## A', '## B', '## C'].join('\n');
    const segments = splitMarkdownIntoBlocks(markdown);
    expect(segments.map((s) => s.markdown)).toEqual(['## A', '## B', '## C']);
  });

  it('# (レベル1) は境界にならない', () => {
    const markdown = ['# トップ', '本文'].join('\n');
    const segments = splitMarkdownIntoBlocks(markdown);
    expect(segments).toHaveLength(1);
    expect(segments[0].markdown).toBe('# トップ\n本文');
  });

  it('空文字列は空配列', () => {
    expect(splitMarkdownIntoBlocks('')).toEqual([{ markdown: '' }]);
  });

  it('blocksToMarkdown は order 昇順で連結する（入力順に依存しない）', () => {
    const blocks: Block[] = [
      { id: 'c', type: 'markdown', order: 2, data: { markdown: 'C' } },
      { id: 'a', type: 'markdown', order: 0, data: { markdown: 'A' } },
      { id: 'b', type: 'markdown', order: 1, data: { markdown: 'B' } },
    ];
    expect(blocksToMarkdown(blocks)).toBe('A\nB\nC');
  });

  it('round-trip: ランダムな見出し混在文書でも無損失', () => {
    const markdown = [
      'プレフィックス行1',
      'プレフィックス行2',
      '#### 深い見出し',
      '内容',
      '',
      '## トップセクション',
      '- 箇条書き1',
      '- 箇条書き2',
    ].join('\n');
    const segments = splitMarkdownIntoBlocks(markdown);
    expect(blocksToMarkdown(toBlocks(segments))).toBe(markdown);
  });
});
