import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const GLOBALS_CSS_PATH = path.resolve(import.meta.dirname, '../../app/globals.css');

/**
 * WCAG 2.x の相対輝度式でコントラスト比を計算する純粋関数。
 * https://www.w3.org/TR/WCAG21/#contrast-minimum
 */
function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return [r, g, b];
}

function srgbChannelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

function contrastRatio(hexA: string, hexB: string): number {
  const luminanceA = relativeLuminance(hexA);
  const luminanceB = relativeLuminance(hexB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** :root（ライト）または .dark ブロック内から `--token: #hex;` を抽出する。 */
function extractToken(cssBlock: string, token: string): string {
  const match = cssBlock.match(new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match) {
    throw new Error(`--${token} not found in the given CSS block`);
  }
  return match[1];
}

function extractBlock(css: string, selector: ':root' | '.dark'): string {
  // :root { ... } または .dark { ... } の最初の波括弧ブロックのみを取り出す（入れ子なし前提）。
  const pattern = selector === ':root' ? /:root\s*\{([\s\S]*?)\n\}/ : /\.dark\s*\{([\s\S]*?)\n\}/;
  const match = css.match(pattern);
  if (!match) {
    throw new Error(`${selector} block not found in globals.css`);
  }
  return match[1];
}

const css = fs.readFileSync(GLOBALS_CSS_PATH, 'utf-8');
const lightBlock = extractBlock(css, ':root');
const darkBlock = extractBlock(css, '.dark');

/** 両テーマで同じキー集合を取り出す。片方だけ検査対象から漏れる事故を防ぐ。 */
function readTokens(block: string) {
  return {
    background: extractToken(block, 'background'),
    card: extractToken(block, 'card'),
    foreground: extractToken(block, 'foreground'),
    mutedForeground: extractToken(block, 'muted-foreground'),
    faint: extractToken(block, 'faint'),
    muted: extractToken(block, 'muted'),
    track: extractToken(block, 'track'),
    primaryDark: extractToken(block, 'primary-dark'),
    primaryHover: extractToken(block, 'primary-hover'),
    primaryForeground: extractToken(block, 'primary-foreground'),
    onAccent: extractToken(block, 'on-accent'),
    accentText: extractToken(block, 'accent-text'),
    accentSoft: extractToken(block, 'accent-soft'),
    chipText: extractToken(block, 'chip-text'),
    chipBg: extractToken(block, 'chip-bg'),
    danger: extractToken(block, 'danger'),
    dangerSoft: extractToken(block, 'danger-soft'),
    warnStrong: extractToken(block, 'warn-strong'),
    warnSoft: extractToken(block, 'warn-soft'),
    surface2: extractToken(block, 'surface2'),
    borderStrong: extractToken(block, 'border-strong'),
  };
}

const light = readTokens(lightBlock);
const dark = readTokens(darkBlock);

const AA_NORMAL_TEXT = 4.5;
// WCAG 1.4.11（非テキストのコントラスト）。操作要素（検索欄・ボタン・ジャンプナビ・
// 空状態の破線）の枠線に使う --border-strong はここを満たす必要がある。文字色と違い
// 3:1 で足りる。旧値（ダーク1.51:1 / ライト1.54:1）はここが無かったため誰にも検知されなかった。
const AA_NON_TEXT = 3.0;

describe('globals.css のコントラスト比（WCAG AA 回帰防止）', () => {
  it('light: --muted-foreground が --background / --card に対し AA(4.5:1) を満たす', () => {
    expect(contrastRatio(light.mutedForeground, light.background)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(light.mutedForeground, light.card)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('dark: --muted-foreground が --background / --card / --muted / --track に対し AA(4.5:1) を満たす', () => {
    expect(contrastRatio(dark.mutedForeground, dark.background)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(dark.mutedForeground, dark.card)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(dark.mutedForeground, dark.muted)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(dark.mutedForeground, dark.track)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('light: --faint が --background に対し AA(4.5:1) を満たす', () => {
    expect(contrastRatio(light.faint, light.background)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it('dark: --faint が --background / --card に対し AA(4.5:1) を満たす', () => {
    expect(contrastRatio(dark.faint, dark.background)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    expect(contrastRatio(dark.faint, dark.card)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  // ここから下は Issue #198 の直し漏れ（bg-primary を選択中の背景に使い 3.74:1 だった箇所が
  // 3 か所残っていた）を二度と通さないための検査。以前は --muted-foreground と --faint しか
  // 見ていなかったため、この種の退行を機械で検出できなかった。
  for (const [themeName, t] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    it(`${themeName}: 選択中の背景 --primary-dark / --primary-hover が --primary-foreground に対し AA を満たす`, () => {
      expect(contrastRatio(t.primaryForeground, t.primaryDark)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(contrastRatio(t.primaryForeground, t.primaryHover)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    it(`${themeName}: --on-accent が --primary-dark に対し AA を満たす`, () => {
      expect(contrastRatio(t.onAccent, t.primaryDark)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    it(`${themeName}: --accent-text が --accent-soft / --background / --card に対し AA を満たす`, () => {
      expect(contrastRatio(t.accentText, t.accentSoft)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(contrastRatio(t.accentText, t.background)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(contrastRatio(t.accentText, t.card)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    it(`${themeName}: --chip-text が --chip-bg に対し AA を満たす`, () => {
      expect(contrastRatio(t.chipText, t.chipBg)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    it(`${themeName}: --danger が --danger-soft / --background / --card に対し AA を満たす`, () => {
      expect(contrastRatio(t.danger, t.dangerSoft)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(contrastRatio(t.danger, t.background)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(contrastRatio(t.danger, t.card)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    it(`${themeName}: --warn-strong が --warn-soft に対し AA を満たす`, () => {
      expect(contrastRatio(t.warnStrong, t.warnSoft)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    it(`${themeName}: --foreground / --muted-foreground が --surface2 に対し AA を満たす`, () => {
      expect(contrastRatio(t.foreground, t.surface2)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
      expect(contrastRatio(t.mutedForeground, t.surface2)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    });

    it(`${themeName}: --border-strong が --background / --card に対し 非テキストAA(3:1, WCAG 1.4.11) を満たす`, () => {
      expect(contrastRatio(t.borderStrong, t.background)).toBeGreaterThanOrEqual(AA_NON_TEXT);
      expect(contrastRatio(t.borderStrong, t.card)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    });
  }
});
