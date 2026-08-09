import { describe, expect, it } from 'vitest';

import { classifyConfigError, isConfigError } from './is-config-error';

describe('isConfigError', () => {
  it('GitHub 連携未設定のエラーを検出する', () => {
    expect(isConfigError(new Error('Missing required GitHub env vars: GITHUB_TOKEN'))).toBe(true);
  });

  it('DATABASE_URL 未設定のエラーを検出する', () => {
    expect(isConfigError(new Error('DATABASE_URL is not set'))).toBe(true);
  });

  it('SKILLSHEET_OWNER_ID 未設定のエラーを検出する', () => {
    expect(isConfigError(new Error('SKILLSHEET_OWNER_ID is not set'))).toBe(true);
  });

  it('GitHub API の 401（トークン不正・失効）を検出する', () => {
    expect(isConfigError(new Error('GitHub API error fetching file: 401'))).toBe(true);
    expect(isConfigError(new Error('GitHub API error listing directory: 401'))).toBe(true);
  });

  it('GitHub API の 5xx やネットワークエラーは設定エラーと判定しない（一時的な障害として扱う）', () => {
    expect(isConfigError(new Error('GitHub API error fetching file: 503'))).toBe(false);
  });

  it('未知のエラーメッセージは設定エラーと判定しない（一時的な障害として扱う）', () => {
    expect(isConfigError(new Error('connect ECONNREFUSED'))).toBe(false);
  });

  it('未マイグレーション（テーブル不在）のエラーを設定エラーとして検出する（.code が取れる場合）', () => {
    const err = new Error('relation "blocks" does not exist');
    (err as { code?: string }).code = '42P01';
    expect(isConfigError(err)).toBe(true);
  });

  it('未マイグレーション（テーブル不在）のエラーを設定エラーとして検出する（.code が無くメッセージのみの場合）', () => {
    expect(isConfigError(new Error('relation "blocks" does not exist'))).toBe(true);
  });

  it('Error インスタンスでない値は false', () => {
    expect(isConfigError('DATABASE_URL is not set')).toBe(false);
    expect(isConfigError(null)).toBe(false);
    expect(isConfigError(undefined)).toBe(false);
  });

  it('DATABASE_URL の書式が壊れている（ERR_INVALID_URL）エラーを検出する（Issue #195）', () => {
    const err = new TypeError('Invalid URL');
    (err as { code?: string }).code = 'ERR_INVALID_URL';
    expect(isConfigError(err)).toBe(true);
  });
});

describe('classifyConfigError', () => {
  it('GitHub 連携未設定と 401（トークン拒否）を別種として分類する（Issue #195）', () => {
    expect(classifyConfigError(new Error('Missing required GitHub env vars: GITHUB_TOKEN'))).toBe('github-missing-env');
    expect(classifyConfigError(new Error('GitHub API error fetching file: 401'))).toBe('github-auth-failed');
  });

  it('DB 未設定・未マイグレーション・書式ミスをそれぞれ別種として分類する', () => {
    expect(classifyConfigError(new Error('DATABASE_URL is not set'))).toBe('db-missing-env');
    expect(classifyConfigError(new Error('SKILLSHEET_OWNER_ID is not set'))).toBe('db-missing-env');

    const tableErr = new Error('relation "blocks" does not exist');
    (tableErr as { code?: string }).code = '42P01';
    expect(classifyConfigError(tableErr)).toBe('db-table-missing');

    const urlErr = new TypeError('Invalid URL');
    (urlErr as { code?: string }).code = 'ERR_INVALID_URL';
    expect(classifyConfigError(urlErr)).toBe('db-malformed-url');
  });

  it('設定不備でないエラーは null を返す', () => {
    expect(classifyConfigError(new Error('connect ECONNREFUSED'))).toBeNull();
  });

  it('tRPC が TRPCError でラップした ERR_INVALID_URL も cause を辿って検出する（Codex レビュー指摘: /view 経由では元の .code が隠れて検出できていなかった）', () => {
    const innerErr = new TypeError('Invalid URL');
    (innerErr as { code?: string }).code = 'ERR_INVALID_URL';
    // TRPCError は message を cause.message で上書きし、code は自身の 'INTERNAL_SERVER_ERROR' になる。
    const wrapped = new Error(innerErr.message, { cause: innerErr });
    (wrapped as { code?: string }).code = 'INTERNAL_SERVER_ERROR';
    expect(classifyConfigError(wrapped)).toBe('db-malformed-url');
  });

  it('cause チェーンのどこにも .code が無ければ null を返す（無限ループしない）', () => {
    const inner = new Error('boom');
    const wrapped = new Error('wrapped', { cause: inner });
    expect(classifyConfigError(wrapped)).toBeNull();
  });
});
