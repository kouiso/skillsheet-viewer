import { describe, it, expect } from 'vitest';
import { createAppTheme } from './theme';

describe('theme', () => {
  describe('createAppTheme', () => {
    describe('ライトモード', () => {
      it('ライトモードのテーマが作成されること', () => {
        const theme = createAppTheme('light');
        expect(theme).toBeDefined();
        expect(theme.palette.mode).toBe('light');
      });

      it('ライトモードのプライマリカラーが正しいこと', () => {
        const theme = createAppTheme('light');
        expect(theme.palette.primary.main).toBe('#6366f1');
        expect(theme.palette.primary.light).toBe('#818cf8');
        expect(theme.palette.primary.dark).toBe('#4f46e5');
        expect(theme.palette.primary.contrastText).toBe('#ffffff');
      });

      it('ライトモードのセカンダリカラーが正しいこと', () => {
        const theme = createAppTheme('light');
        expect(theme.palette.secondary.main).toBe('#ec4899');
        expect(theme.palette.secondary.light).toBe('#f472b6');
        expect(theme.palette.secondary.dark).toBe('#db2777');
        expect(theme.palette.secondary.contrastText).toBe('#ffffff');
      });

      it('ライトモードの背景色が正しいこと', () => {
        const theme = createAppTheme('light');
        expect(theme.palette.background.default).toBe('#f8fafc');
        expect(theme.palette.background.paper).toBe('#ffffff');
      });

      it('ライトモードのテキストカラーが正しいこと', () => {
        const theme = createAppTheme('light');
        expect(theme.palette.text.primary).toBe('#0f172a');
        expect(theme.palette.text.secondary).toBe('#475569');
      });

      it('ライトモードのdividerカラーが正しいこと', () => {
        const theme = createAppTheme('light');
        expect(theme.palette.divider).toBe('#e2e8f0');
      });
    });

    describe('ダークモード', () => {
      it('ダークモードのテーマが作成されること', () => {
        const theme = createAppTheme('dark');
        expect(theme).toBeDefined();
        expect(theme.palette.mode).toBe('dark');
      });

      it('ダークモードのプライマリカラーが正しいこと', () => {
        const theme = createAppTheme('dark');
        expect(theme.palette.primary.main).toBe('#818cf8');
        expect(theme.palette.primary.light).toBe('#a5b4fc');
        expect(theme.palette.primary.dark).toBe('#6366f1');
        expect(theme.palette.primary.contrastText).toBe('#ffffff');
      });

      it('ダークモードのセカンダリカラーが正しいこと', () => {
        const theme = createAppTheme('dark');
        expect(theme.palette.secondary.main).toBe('#f472b6');
        expect(theme.palette.secondary.light).toBe('#f9a8d4');
        expect(theme.palette.secondary.dark).toBe('#ec4899');
        expect(theme.palette.secondary.contrastText).toBe('#ffffff');
      });

      it('ダークモードの背景色が正しいこと', () => {
        const theme = createAppTheme('dark');
        expect(theme.palette.background.default).toBe('#0f172a');
        expect(theme.palette.background.paper).toBe('#1e293b');
      });

      it('ダークモードのテキストカラーが正しいこと', () => {
        const theme = createAppTheme('dark');
        expect(theme.palette.text.primary).toBe('#f1f5f9');
        expect(theme.palette.text.secondary).toBe('#cbd5e1');
      });

      it('ダークモードのdividerカラーが正しいこと', () => {
        const theme = createAppTheme('dark');
        expect(theme.palette.divider).toBe('#334155');
      });
    });

    describe('タイポグラフィ', () => {
      it('フォントファミリーが正しく設定されていること', () => {
        const theme = createAppTheme('light');
        expect(theme.typography.fontFamily).toContain('Helvetica Neue');
        expect(theme.typography.fontFamily).toContain('Hiragino Kaku Gothic ProN');
        expect(theme.typography.fontFamily).toContain('Meiryo');
      });

      it('h1のスタイルが正しいこと', () => {
        const theme = createAppTheme('light');
        expect(theme.typography.h1.fontWeight).toBe(700);
        expect(theme.typography.h1.fontSize).toBe('2.5rem');
        expect(theme.typography.h1.lineHeight).toBe(1.2);
      });

      it('h2のスタイルが正しいこと', () => {
        const theme = createAppTheme('light');
        expect(theme.typography.h2.fontWeight).toBe(700);
        expect(theme.typography.h2.fontSize).toBe('2rem');
        expect(theme.typography.h2.lineHeight).toBe(1.3);
      });

      it('h3のスタイルが正しいこと', () => {
        const theme = createAppTheme('light');
        expect(theme.typography.h3.fontWeight).toBe(600);
        expect(theme.typography.h3.fontSize).toBe('1.75rem');
        expect(theme.typography.h3.lineHeight).toBe(1.4);
      });

      it('h4のスタイルが正しいこと', () => {
        const theme = createAppTheme('light');
        expect(theme.typography.h4.fontWeight).toBe(600);
        expect(theme.typography.h4.fontSize).toBe('1.5rem');
        expect(theme.typography.h4.lineHeight).toBe(1.4);
      });

      it('h5のスタイルが正しいこと', () => {
        const theme = createAppTheme('light');
        expect(theme.typography.h5.fontWeight).toBe(600);
        expect(theme.typography.h5.fontSize).toBe('1.25rem');
        expect(theme.typography.h5.lineHeight).toBe(1.5);
      });

      it('h6のスタイルが正しいこと', () => {
        const theme = createAppTheme('light');
        expect(theme.typography.h6.fontWeight).toBe(600);
        expect(theme.typography.h6.fontSize).toBe('1rem');
        expect(theme.typography.h6.lineHeight).toBe(1.6);
      });

      it('body1のスタイルが正しいこと', () => {
        const theme = createAppTheme('light');
        expect(theme.typography.body1.fontSize).toBe('1rem');
        expect(theme.typography.body1.lineHeight).toBe(1.75);
      });

      it('body2のスタイルが正しいこと', () => {
        const theme = createAppTheme('light');
        expect(theme.typography.body2.fontSize).toBe('0.875rem');
        expect(theme.typography.body2.lineHeight).toBe(1.6);
      });
    });

    describe('シェイプ', () => {
      it('borderRadiusが正しく設定されていること', () => {
        const theme = createAppTheme('light');
        expect(theme.shape.borderRadius).toBe(12);
      });
    });

    describe('シャドウ', () => {
      it('シャドウ配列が25個あること', () => {
        const theme = createAppTheme('light');
        expect(theme.shadows).toHaveLength(25);
      });

      it('最初のシャドウがnoneであること', () => {
        const theme = createAppTheme('light');
        expect(theme.shadows[0]).toBe('none');
      });

      it('カスタムシャドウが設定されていること', () => {
        const theme = createAppTheme('light');
        expect(theme.shadows[1]).toBe('0 1px 2px 0 rgb(0 0 0 / 0.05)');
        expect(theme.shadows[2]).toContain('0 1px 3px 0 rgb(0 0 0 / 0.1)');
      });
    });

    describe('コンポーネントスタイル', () => {
      it('MuiButtonのスタイルオーバーライドが設定されていること', () => {
        const theme = createAppTheme('light');
        expect(theme.components?.MuiButton?.styleOverrides?.root).toBeDefined();
      });

      it('MuiButtonのtextTransformがnoneであること', () => {
        const theme = createAppTheme('light');
        const buttonRoot = theme.components?.MuiButton?.styleOverrides?.root as Record<string, unknown>;
        expect(buttonRoot.textTransform).toBe('none');
      });

      it('MuiButtonのfontWeightが600であること', () => {
        const theme = createAppTheme('light');
        const buttonRoot = theme.components?.MuiButton?.styleOverrides?.root as Record<string, unknown>;
        expect(buttonRoot.fontWeight).toBe(600);
      });

      it('MuiButtonのborderRadiusが8であること', () => {
        const theme = createAppTheme('light');
        const buttonRoot = theme.components?.MuiButton?.styleOverrides?.root as Record<string, unknown>;
        expect(buttonRoot.borderRadius).toBe(8);
      });

      it('MuiCardのスタイルオーバーライドが設定されていること', () => {
        const theme = createAppTheme('light');
        expect(theme.components?.MuiCard?.styleOverrides?.root).toBeDefined();
      });

      it('MuiPaperのbackgroundImageがnoneであること', () => {
        const theme = createAppTheme('light');
        const paperRoot = theme.components?.MuiPaper?.styleOverrides?.root as Record<string, unknown>;
        expect(paperRoot.backgroundImage).toBe('none');
      });
    });

    describe('テーマの整合性', () => {
      it('ライトモードとダークモードで異なるカラーパレットを持つこと', () => {
        const lightTheme = createAppTheme('light');
        const darkTheme = createAppTheme('dark');

        expect(lightTheme.palette.primary.main).not.toBe(darkTheme.palette.primary.main);
        expect(lightTheme.palette.background.default).not.toBe(darkTheme.palette.background.default);
        expect(lightTheme.palette.text.primary).not.toBe(darkTheme.palette.text.primary);
      });

      it('両モードで同じタイポグラフィ設定を持つこと', () => {
        const lightTheme = createAppTheme('light');
        const darkTheme = createAppTheme('dark');

        expect(lightTheme.typography.h1.fontWeight).toBe(darkTheme.typography.h1.fontWeight);
        expect(lightTheme.typography.fontFamily).toBe(darkTheme.typography.fontFamily);
      });

      it('両モードで同じシェイプ設定を持つこと', () => {
        const lightTheme = createAppTheme('light');
        const darkTheme = createAppTheme('dark');

        expect(lightTheme.shape.borderRadius).toBe(darkTheme.shape.borderRadius);
      });
    });
  });
});
