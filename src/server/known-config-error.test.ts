import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';

import { MISSING_SERVER_ENV_PREFIX } from '@/lib/env';

import {
  isKnownConfigError,
  REVALIDATE_SECRET_MISSING_MESSAGE,
  SESSION_SECRET_MISSING_MESSAGE,
  VIEWER_AUTH_NOT_CONFIGURED_MESSAGE,
} from './known-config-error';

describe('isKnownConfigError', () => {
  it.each([
    ['assertServerEnv の欠落', new Error(`${MISSING_SERVER_ENV_PREFIX}: DATABASE_URL。`)],
    ['classifyConfigError が拾う DB 未設定', new Error('DATABASE_URL is not set')],
    ['classifyConfigError が拾う GitHub 未設定', new Error('Missing required GitHub env vars: GITHUB_TOKEN')],
    ['SESSION_SECRET 未設定', new Error(SESSION_SECRET_MISSING_MESSAGE)],
    [
      'VIEWER_CODE 未設定（TRPCError 経由）',
      new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: VIEWER_AUTH_NOT_CONFIGURED_MESSAGE }),
    ],
    [
      'REVALIDATE_SECRET 未設定（TRPCError 経由）',
      new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: REVALIDATE_SECRET_MISSING_MESSAGE }),
    ],
  ])('%s は設定不備として扱う', (_label, error) => {
    expect(isKnownConfigError(error)).toBe(true);
  });

  it('未知のエラーは設定不備ではない', () => {
    expect(isKnownConfigError(new Error('something unexpected'))).toBe(false);
  });

  it('Error でない値は設定不備ではない', () => {
    expect(isKnownConfigError('SESSION_SECRET is not set')).toBe(false);
    expect(isKnownConfigError(undefined)).toBe(false);
  });
});
