import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DESIGN_TOKENS_LIGHT } from './design-tokens';

// globals.css の :root ブロックから CSS 変数値を抽出し、design-tokens.ts の値と
// 機械的に一致させる。乖離があれば PDF と Web の配色がズレていることを CI で検出する。
function extractRootVar(css: string, name: string): string {
  const match = css.match(new RegExp(`:root\\s*{[^}]*--${name}:\\s*(#[0-9a-fA-F]{3,8})`, 's'));
  if (!match) throw new Error(`--${name} not found in :root block`);
  return match[1].toLowerCase();
}

describe('design-tokens vs globals.css :root', () => {
  const css = readFileSync(join(__dirname, '../../app/globals.css'), 'utf-8');

  it('primary/primaryDark/mutedForeground/muted/border/foreground が :root と一致する', () => {
    expect(DESIGN_TOKENS_LIGHT.foreground).toBe(extractRootVar(css, 'foreground'));
    expect(DESIGN_TOKENS_LIGHT.primary).toBe(extractRootVar(css, 'primary'));
    expect(DESIGN_TOKENS_LIGHT.primaryDark).toBe(extractRootVar(css, 'primary-dark'));
    expect(DESIGN_TOKENS_LIGHT.mutedForeground).toBe(extractRootVar(css, 'muted-foreground'));
    expect(DESIGN_TOKENS_LIGHT.muted).toBe(extractRootVar(css, 'muted'));
    expect(DESIGN_TOKENS_LIGHT.border).toBe(extractRootVar(css, 'border'));
  });
});
