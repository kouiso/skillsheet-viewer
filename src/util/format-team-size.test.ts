import { describe, expect, it } from 'vitest';

import { formatTeamSize } from './format-team-size';

describe('formatTeamSize', () => {
  it('単位なしの数値のみには「名」を補う（ビルダーのplaceholder「例：13」通りの入力）', () => {
    expect(formatTeamSize('13')).toBe('13名');
  });

  it('既に単位が付いている実データはそのまま出す（二重付与しない、#136）', () => {
    expect(formatTeamSize('13 名')).toBe('13 名');
    expect(formatTeamSize('9人')).toBe('9人');
  });

  it('数値以外の自由記述はそのまま出す', () => {
    expect(formatTeamSize('数名（詳細不明）')).toBe('数名（詳細不明）');
  });

  it('前後の空白があっても数値のみなら「名」を補う', () => {
    expect(formatTeamSize(' 5 ')).toBe('5名');
  });
});
