import { describe, expect, it } from 'vitest';

import { EMAIL_PATTERN, parseEnvFile } from './bootstrap-owner';

describe('parseEnvFile', () => {
  it('KEY=value 形式を読む', () => {
    expect(parseEnvFile('DATABASE_URL=postgres://x\nBETTER_AUTH_SECRET=abc')).toEqual({
      DATABASE_URL: 'postgres://x',
      BETTER_AUTH_SECRET: 'abc',
    });
  });

  it('コメント行・空行・キーのみの行を無視する', () => {
    expect(parseEnvFile('# comment\n\nDATABASE_URL=x\nNO_EQUALS_LINE\n')).toEqual({ DATABASE_URL: 'x' });
  });

  it('クォート（シングル/ダブル）を剥がす', () => {
    expect(parseEnvFile(`A="double"\nB='single'`)).toEqual({ A: 'double', B: 'single' });
  });

  it('値の前後の空白をトリムする', () => {
    expect(parseEnvFile('KEY =  value  ')).toEqual({ KEY: 'value' });
  });
});

describe('EMAIL_PATTERN（Better Auth の z.email() と同じ検証を先取りで弾く）', () => {
  it('TLDの無いメールアドレスを拒否する（実際に Better Auth 側で弾かれ、作成成功の表示と食い違う事故を防ぐ）', () => {
    expect(EMAIL_PATTERN.test('owner@example')).toBe(false);
  });

  it('通常のメールアドレスは許可する', () => {
    expect(EMAIL_PATTERN.test('owner@example.com')).toBe(true);
    expect(EMAIL_PATTERN.test('owner+tag@example.co.jp')).toBe(true);
  });

  it('ローカル部にドットを含む通常のメールアドレスも許可する（Better Auth の z.email() は許可するため）', () => {
    expect(EMAIL_PATTERN.test('owner.name@example.com')).toBe(true);
  });

  it('連続ドット・先頭ドットは引き続き拒否する', () => {
    expect(EMAIL_PATTERN.test('owner..name@example.com')).toBe(false);
    expect(EMAIL_PATTERN.test('.owner@example.com')).toBe(false);
  });

  it('@ が無い、ドメイン部が無い等の明らかな不正形式を拒否する', () => {
    expect(EMAIL_PATTERN.test('not-an-email')).toBe(false);
    expect(EMAIL_PATTERN.test('owner@')).toBe(false);
    expect(EMAIL_PATTERN.test('@example.com')).toBe(false);
  });
});
