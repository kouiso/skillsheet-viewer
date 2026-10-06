'use client';

import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useThemeMode = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within ThemeProvider');
  }
  return context;
};

interface ThemeModeProviderProps {
  children: ReactNode;
}

export const ThemeModeProvider = ({ children }: ThemeModeProviderProps) => {
  // SSR ではブラウザ API に触れないため初期値は 'light' 固定。
  // 実際の保存値/システム設定はマウント後（useEffect）に読み込んで反映する。
  const [mode, setMode] = useState<ThemeMode>('light');
  // 保存値/システム設定の復元が終わるまで false のままにし、保存系 effect の
  // ゲートとして使う。復元前のマウントコミットでは mode が SSR 初期値
  // 'light' のままなので、その値を localStorage へ書き戻すと保存済みの
  // 'dark' を一瞬上書きする（その間にアンロード/クラッシュが挟まると
  // 'light' が残り、復元完了まで毎回ライトでチラつく）（#374）。
  const [restored, setRestored] = useState(false);

  // マウント時に localStorage / システム設定から初期テーマを復元する
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('theme-mode');
    } catch {
      // 保存領域の利用拒否は閲覧の失敗にせず、OS の設定へフォールバックする。
    }
    if (saved === 'light' || saved === 'dark') {
      setMode(saved);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setMode('dark');
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) {
      return;
    }
    // 永続化できない環境でも、この画面で選んだテーマは利用できるようにする。
    const root = document.documentElement;
    if (mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('theme-mode', mode);
    } catch {
      // 容量不足・利用拒否時は再訪時の保存を諦め、現在の表示と操作を保つ。
    }
  }, [mode, restored]);

  const toggleTheme = () => {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return <ThemeContext.Provider value={{ mode, toggleTheme }}>{children}</ThemeContext.Provider>;
};
