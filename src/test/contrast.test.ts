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

const light = {
  background: extractToken(lightBlock, 'background'),
  card: extractToken(lightBlock, 'card'),
  foreground: extractToken(lightBlock, 'foreground'),
  mutedForeground: extractToken(lightBlock, 'muted-foreground'),
  faint: extractToken(lightBlock, 'faint'),
  muted: extractToken(lightBlock, 'muted'),
  track: extractToken(lightBlock, 'track'),
};

const dark = {
  background: extractToken(darkBlock, 'background'),
  card: extractToken(darkBlock, 'card'),
  foreground: extractToken(darkBlock, 'foreground'),
  mutedForeground: extractToken(darkBlock, 'muted-foreground'),
  faint: extractToken(darkBlock, 'faint'),
  muted: extractToken(darkBlock, 'muted'),
  track: extractToken(darkBlock, 'track'),
};

const AA_NORMAL_TEXT = 4.5;

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
});
