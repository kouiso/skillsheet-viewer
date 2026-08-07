import { describe, expect, it } from 'vitest';

import { isConfigError } from './is-config-error';

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
});
