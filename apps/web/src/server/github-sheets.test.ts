import { describe, expect, it } from 'vitest';

import { isSheetFileName } from './github-sheets';

describe('isSheetFileName', () => {
  it('スキルシートの .md は許可する', () => {
    expect(isSheetFileName('skillsheet.md')).toBe(true);
    expect(isSheetFileName('技術スキルシート.md')).toBe(true);
    expect(isSheetFileName('engineer-profile.md')).toBe(true);
  });

  it('リポジトリ設定 / AI 指示系の .md は除外する', () => {
    for (const name of [
      'CLAUDE.md',
      'AGENTS.md',
      'README.md',
      'GEMINI.md',
      'copilot-instructions.md',
      'CONTRIBUTING.md',
      'LICENSE.md',
      'SECURITY.md',
      'CHANGELOG.md',
    ]) {
      expect(isSheetFileName(name)).toBe(false);
    }
  });

  it('大文字小文字を無視して除外する', () => {
    expect(isSheetFileName('claude.md')).toBe(false);
    expect(isSheetFileName('Readme.md')).toBe(false);
  });

  it('.md 以外・ドットファイルは除外する', () => {
    expect(isSheetFileName('skillsheet.txt')).toBe(false);
    expect(isSheetFileName('.hidden.md')).toBe(false);
  });
});
