import { describe, expect, it, vi } from 'vitest';
import { THEME_INIT_SCRIPT } from './theme-init-script';

describe('ハイドレーション前のテーマ復元', () => {
  it.each([false, true])('保存値と利用拒否を OS 設定と整合させること（dark: %s）', (systemDark) => {
    for (const saved of ['light', 'dark', 'invalid', '', null]) {
      const root = document.createElement('html');
      const run = new Function('localStorage', 'window', 'document', THEME_INIT_SCRIPT);
      const window = { matchMedia: () => ({ matches: systemDark }) };
      run({ getItem: () => saved }, window, { documentElement: root });
      expect(root.classList.contains('dark')).toBe(saved === 'dark' || (saved !== 'light' && systemDark));
      run(
        {
          getItem: () => {
            throw new DOMException('利用拒否', 'SecurityError');
          },
        },
        window,
        { documentElement: root },
      );
      expect(root.classList.contains('dark')).toBe(systemDark);
    }
  });

  it('保存済み light は OS の dark より優先し、保存値には書き込まないこと', () => {
    const setItem = vi.fn();
    const root = document.createElement('html');
    root.classList.add('dark');
    new Function('localStorage', 'window', 'document', THEME_INIT_SCRIPT)(
      { getItem: () => 'light', setItem },
      { matchMedia: () => ({ matches: true }) },
      { documentElement: root },
    );
    expect(root.classList.contains('dark')).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
  });
});
