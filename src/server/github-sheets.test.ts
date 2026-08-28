import { describe, expect, it } from 'vitest';

import { isSheetFileName, isValidSheetPath } from './github-sheets';

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

describe('isValidSheetPath', () => {
  it('日本語・ASCII のフラットな .md を許可する', () => {
    expect(isValidSheetPath('skillsheet.md')).toBe(true);
    expect(isValidSheetPath('技術.md')).toBe(true);
    expect(isValidSheetPath('engineer-profile.md')).toBe(true);
    expect(isValidSheetPath('a_b.name.md')).toBe(true);
  });

  it('パストラバーサル（..）を拒否する', () => {
    expect(isValidSheetPath('../etc/passwd')).toBe(false);
    expect(isValidSheetPath('../secret.md')).toBe(false);
  });

  it('絶対パス（先頭 /）を拒否する', () => {
    expect(isValidSheetPath('/abs.md')).toBe(false);
  });

  it('NUL バイトを含むパスを拒否する', () => {
    expect(isValidSheetPath('evil\0.md')).toBe(false);
  });

  it('ディレクトリ区切り（/）を含むパスを拒否する', () => {
    expect(isValidSheetPath('sub/dir.md')).toBe(false);
  });

  it('.md 以外・空文字を拒否する', () => {
    expect(isValidSheetPath('file.txt')).toBe(false);
    expect(isValidSheetPath('noext')).toBe(false);
    expect(isValidSheetPath('')).toBe(false);
  });
});
