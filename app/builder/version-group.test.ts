import { describe, expect, it } from 'vitest';
import type { VersionSummary } from '@/db/document-history';
import { groupVersions, type VersionRow } from './version-group';

const base = Date.parse('2026-10-11T03:00:00Z');
// 引数は古い順に書き、一覧と同じ新しい順に並べ替えて渡す。
function versions(...entries: [minutes: number, action?: string][]): VersionSummary[] {
  return entries
    .map(([minutes, action = 'save'], index) => ({
      revision: String(index + 1),
      title: '合成',
      recordedAt: new Date(base + minutes * 60_000).toISOString(),
      action,
      restoredFrom: null,
      restoredBefore: null,
    }))
    .reverse();
}
const shape = (rows: VersionRow[]) =>
  rows.map((row) => (row.kind === 'single' ? row.version.revision : row.versions.map((v) => v.revision)));

describe('自動保存の版を一覧でたたむ', () => {
  it('2分未満で続いた保存は1行にまとめ、新しい順で持つ', () => {
    expect(shape(groupVersions(versions([0], [0.5], [1.9])))).toEqual([['3', '2', '1']]);
  });

  it('直前の保存から2分以上あいたら分ける（ちょうど2分も分ける）', () => {
    expect(shape(groupVersions(versions([0], [1], [3])))).toEqual(['3', ['2', '1']]);
    expect(shape(groupVersions(versions([0], [2])))).toEqual(['2', '1']);
  });

  it('手を止めずに続けても、まとまりの最初から10分で区切る', () => {
    const minutes = Array.from({ length: 12 }, (_, i): [number] => [i * 1.5]);
    // 0〜9分の7件で1まとまり、10.5分から次のまとまり。
    expect(shape(groupVersions(versions(...minutes)))).toEqual([
      ['12', '11', '10', '9', '8'],
      ['7', '6', '5', '4', '3', '2', '1'],
    ]);
  });

  it('保存以外の版は常に1行で、前後のまとまりを分ける', () => {
    expect(shape(groupVersions(versions([0, 'create'], [0.2], [0.4], [0.6, 'restore'], [0.8], [1])))).toEqual([
      ['6', '5'],
      '4',
      ['3', '2'],
      '1',
    ]);
  });

  it('1件だけ・空・時刻が読めない版も扱える', () => {
    expect(shape(groupVersions(versions([0])))).toEqual(['1']);
    expect(groupVersions([])).toEqual([]);
    const broken = versions([0], [0.5]);
    broken[0] = { ...broken[0], recordedAt: 'not-a-date' };
    expect(shape(groupVersions(broken))).toEqual(['2', '1']);
  });

  it('次のページを足しても、境目をまたいでまとめ直す', () => {
    const all = versions([0], [0.5], [1], [1.5]);
    const firstPage = all.slice(0, 2);
    expect(shape(groupVersions(firstPage))).toEqual([['4', '3']]);
    expect(shape(groupVersions(all))).toEqual([['4', '3', '2', '1']]);
  });

  it('たたんでも、すべての版がちょうど1回ずつどこかの行に入る', () => {
    const input = versions([0, 'create'], [0.1], [0.2], [5], [5.1, 'restore'], [6], [30], [30.5], [31]);
    const output = groupVersions(input).flatMap((row) => (row.kind === 'single' ? [row.version] : row.versions));
    expect(output.map((v) => v.revision)).toEqual(input.map((v) => v.revision));
  });
});
