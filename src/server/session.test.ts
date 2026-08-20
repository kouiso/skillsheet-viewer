import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSessionToken, verifySessionToken } from './session';

// session.ts は process.env.SESSION_SECRET を実行時に参照する（モジュール読み込み時ではない）ため、
// 各テストで明示的にセットして決定性を担保する。ネットワーク/DB は一切使わない。
const TEST_SECRET = 'test-session-secret-deadbeef';

beforeEach(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createSessionToken / verifySessionToken', () => {
  it('round-trips: 生成したトークンは検証を通る', () => {
    const token = createSessionToken();
    expect(verifySessionToken(token)).toBe(true);
  });

  it('round-trip した結果は payload.signature の 2 部構成になっている', () => {
    const token = createSessionToken();
    const dotIndex = token.lastIndexOf('.');
    expect(dotIndex).toBeGreaterThan(0);
    expect(token.slice(dotIndex + 1).length).toBeGreaterThan(0);
  });

  it('verifySessionToken(undefined) は false', () => {
    expect(verifySessionToken(undefined)).toBe(false);
  });

  it('空文字は false', () => {
    expect(verifySessionToken('')).toBe(false);
  });

  it('"." を含まない不正トークンは false', () => {
    expect(verifySessionToken('not-a-token')).toBe(false);
  });

  it('payload だけで署名が無い不正トークンは false', () => {
    const payloadB64 = Buffer.from(JSON.stringify({ iat: 0, exp: 9_999_999_999 })).toString('base64url');
    // 末尾に空の署名が付くだけのケース
    expect(verifySessionToken(`${payloadB64}.`)).toBe(false);
  });

  it('署名が改ざんされたトークンは false', () => {
    const token = createSessionToken();
    const dotIndex = token.lastIndexOf('.');
    const payloadB64 = token.slice(0, dotIndex);
    // 正しい署名と同じ長さの別署名（別シークレットで作る）→ 検証失敗するはず
    const forgedSig = createHmac('sha256', Buffer.from('attacker-secret', 'utf-8'))
      .update(payloadB64)
      .digest('base64url');
    expect(verifySessionToken(`${payloadB64}.${forgedSig}`)).toBe(false);
  });

  it('payload を改ざんすると（署名はそのまま）false', () => {
    const token = createSessionToken();
    const dotIndex = token.lastIndexOf('.');
    const sig = token.slice(dotIndex + 1);
    const tamperedPayload = Buffer.from(JSON.stringify({ iat: 0, exp: 9_999_999_999 })).toString('base64url');
    expect(verifySessionToken(`${tamperedPayload}.${sig}`)).toBe(false);
  });

  it('期限切れトークンは false（fake timers で決定的に検証）', () => {
    // 固定時刻でトークンを生成し、有効期限（7日）を超えて時計を進める。
    const issuedAt = new Date('2026-01-01T00:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(issuedAt);

    const token = createSessionToken();
    // 生成直後は有効
    expect(verifySessionToken(token)).toBe(true);

    // 8日後に進める（有効期限は 7日）→ 期限切れ
    vi.setSystemTime(new Date(issuedAt.getTime() + 8 * 24 * 60 * 60 * 1000));
    expect(verifySessionToken(token)).toBe(false);
  });
});
