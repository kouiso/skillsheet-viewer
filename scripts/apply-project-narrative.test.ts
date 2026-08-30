import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNarrative } from './apply-project-narrative';

function write(content: unknown): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'narrative-')), 'n.json');
  writeFileSync(file, JSON.stringify(content));
  return file;
}

describe('readNarrative の検証', () => {
  it('文字列だけのパッチは通す', () => {
    const file = write({ projects: { 案件: { role: 'フロントエンドエンジニア' } } });
    expect(readNarrative(file).projects?.案件?.role).toBe('フロントエンドエンジニア');
  });

  it('値が null なら DB へ触る前に止める', () => {
    // 素通しすると更新ループの value.length で落ちる（レビュー指摘）。
    expect(() => readNarrative(write({ projects: { 案件: { role: null } } }))).toThrow(/role/);
  });

  it('値が数値なら止める（型に合わない値をそのまま保存しない）', () => {
    expect(() => readNarrative(write({ projects: { 案件: { comment: 3 } } }))).toThrow(/comment/);
  });

  it('パッチ自体が null なら止める', () => {
    expect(() => readNarrative(write({ projects: { 案件: null } }))).toThrow(/オブジェクト/);
  });

  it('知らない項目は止める（綴り間違いが黙って捨てられない）', () => {
    expect(() => readNarrative(write({ projects: { 案件: { roles: 'PL' } } }))).toThrow(/roles/);
  });

  it('会社側も同じ規則で見る', () => {
    expect(() => readNarrative(write({ companies: { 会社: { note: [] } } }))).toThrow(/note/);
  });
});
