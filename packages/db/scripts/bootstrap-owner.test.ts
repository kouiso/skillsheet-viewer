import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { EMAIL_PATTERN, parseEnvFile, promptHiddenPassword } from './bootstrap-owner';

/** stdin の raw mode 対話入力を模した最小限のフェイク。 */
function createFakeStdin(isTTY = true) {
  const emitter = new EventEmitter() as EventEmitter & {
    isTTY: boolean;
    setRawMode: (v: boolean) => void;
    setEncoding: (v: string) => void;
    resume: () => void;
    pause: () => void;
  };
  emitter.isTTY = isTTY;
  emitter.setRawMode = vi.fn();
  emitter.setEncoding = vi.fn();
  emitter.resume = vi.fn();
  emitter.pause = vi.fn();
  return emitter;
}

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

describe('promptHiddenPassword（対話プロンプトでのパスワード入力。シェル履歴・ps へのargv露出を避けるため追加）', () => {
  it('通常の文字入力からEnterまでを1つのパスワード文字列として解決する', async () => {
    const stdin = createFakeStdin();
    const promise = promptHiddenPassword('prompt', stdin as unknown as NodeJS.ReadStream);
    stdin.emit('data', 'a');
    stdin.emit('data', 'b');
    stdin.emit('data', 'c');
    stdin.emit('data', '\n');
    await expect(promise).resolves.toBe('abc');
  });

  it('バックスペースで直前の1文字を取り消す', async () => {
    const stdin = createFakeStdin();
    const promise = promptHiddenPassword('prompt', stdin as unknown as NodeJS.ReadStream);
    stdin.emit('data', 'a');
    stdin.emit('data', 'b');
    stdin.emit('data', '');
    stdin.emit('data', 'c');
    stdin.emit('data', '\n');
    await expect(promise).resolves.toBe('ac');
  });

  it('1回のdataイベントに複数文字がまとめて届いても（ペースト・バッファリング相当）Enterまでを正しく1つのパスワード文字列として解決する（レビュー指摘: chunk全体を1文字として厳密一致していたため制御文字を認識できなかった）', async () => {
    const stdin = createFakeStdin();
    const promise = promptHiddenPassword('prompt', stdin as unknown as NodeJS.ReadStream);
    stdin.emit('data', 'Secret\n');
    await expect(promise).resolves.toBe('Secret');
  });

  it('Ctrl-C（\\u0003）で入力がキャンセルされエラーになる', async () => {
    const stdin = createFakeStdin();
    const promise = promptHiddenPassword('prompt', stdin as unknown as NodeJS.ReadStream);
    stdin.emit('data', 'a');
    stdin.emit('data', '');
    await expect(promise).rejects.toThrow('入力がキャンセルされました');
  });

  it('非TTY環境ではエラーになる（対話入力できないため）', async () => {
    const stdin = createFakeStdin(false);
    await expect(promptHiddenPassword('prompt', stdin as unknown as NodeJS.ReadStream)).rejects.toThrow('非対話環境');
  });
});
