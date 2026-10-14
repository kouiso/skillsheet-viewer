import { describe, expect, it } from 'vitest';
import type { VersionSummary } from '@/db/document-history';
import { groupVersions, MAX_SPAN_MS, type VersionRow } from './version-group';

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

  it('手を止めずに続けても、まとまりの最新から10分で区切る', () => {
    const minutes = Array.from({ length: 12 }, (_, i): [number] => [i * 1.5]);
    // 新しい側を起点に10分: 16.5〜7.5分の7件で1まとまり、6分から次のまとまり。
    expect(shape(groupVersions(versions(...minutes)))).toEqual([
      ['12', '11', '10', '9', '8', '7', '6'],
      ['5', '4', '3', '2', '1'],
    ]);
  });

  it('次ページの古い版を足しても既存のまとまりは壊れず、伸びるのは末尾だけ', () => {
    // 10分超の連続保存を20件用意し、10件ずつのページで読む。
    const all = versions(...Array.from({ length: 20 }, (_, i): [number] => [i * 1.5]));
    const page1 = all.slice(0, 10);
    const rows1 = shape(groupVersions(page1));
    const rows2 = shape(groupVersions(all));
    // 1ページ目の上位まとまりは追加読み込み後も同じキー（最新版）で同じ構成
    expect(rows2[0]).toEqual(rows1[0]);
    // 差が出るのは末尾のまとまりだけ。最後以外の行は内容ごと不変
    expect(rows2.slice(0, rows1.length - 1)).toEqual(rows1.slice(0, -1));
    // 20件連続(0〜28.5分): 最新起点10分ごとに区切られる
    expect(rows2.length).toBeGreaterThanOrEqual(3);
    // どの版も必ずどれか1行に1回だけ入る（脱落・重複なし）
    const flat = rows2.flat();
    expect(flat).toEqual(all.map((v) => v.revision));
  });

  it('まとまりの最新からちょうど10分あいた保存は同じまとまりに入れない', () => {
    // 新しい側(10分)から見て、0分の版は差がちょうど10分。他は2分未満の間隔でつながっている。
    const input = versions([0], [1.9], [3.8], [5.7], [7.6], [9.5], [10]);
    expect(shape(groupVersions(input))).toEqual([['7', '6', '5', '4', '3', '2'], '1']);
    // 9.9分なら同じまとまりに入る。
    expect(shape(groupVersions(versions([0.1], [1.9], [3.8], [5.7], [7.6], [9.5], [10])))).toEqual([
      ['7', '6', '5', '4', '3', '2', '1'],
    ]);
  });

  it('時刻が版番号の順と逆（並行した保存）でも、版は脱落・重複せずまとまる', () => {
    // 版 2 のほうが版 3 より後の時刻になっている（recordedAt は DB の now() で、並行すると逆転しうる）。
    const input = versions([0], [1.0], [0.5]);
    const rows = groupVersions(input);
    expect(
      rows.flatMap((row) => (row.kind === 'single' ? [row.version.revision] : row.versions.map((v) => v.revision))),
    ).toEqual(['3', '2', '1']);
    expect(shape(rows)).toEqual([['3', '2', '1']]);
    // 逆転が2分以上なら並行した保存ではない（時計のずれ・後からの投入）ので、別のまとまりにする。
    // 符号付きの差で見ると、数時間逆転した版も同じまとまりに入り、「10:00〜翌 09:00 の編集」になってしまう。
    expect(shape(groupVersions(versions([0], [5], [1])))).toEqual(['3', '2', '1']);
    expect(shape(groupVersions(versions([0], [600], [1])))).toEqual(['3', '2', '1']);
    // 時刻が逆向きに並び続けても、まとまりの最新から10分で区切る（符号付きの差では永遠につながってしまう）。
    const reversedChain = versions([12], [10.5], [9], [7.5], [6], [4.5], [3], [1.5], [0]);
    expect(shape(groupVersions(reversedChain))).toEqual([
      ['9', '8', '7', '6', '5', '4', '3'],
      ['2', '1'],
    ]);
    // 時刻がジグザグに並んでも、まとまりの時刻の幅（最小〜最大）は10分を超えない。
    const zigzag = versions([0], [1.9], [3.8], [5.7], [7.6], [9.5], [7.7], [5.8], [3.9], [2.0], [0.1], [-1.8], [-3.7]);
    for (const row of groupVersions(zigzag)) {
      if (row.kind === 'single') continue;
      const times = row.versions.map((v) => Date.parse(v.recordedAt));
      expect(Math.max(...times) - Math.min(...times)).toBeLessThan(MAX_SPAN_MS);
    }
    // 幅は最小の時刻からも測る：新しい側から 5分 → 0分 と下がったあと 10.2分まで戻ると、最小(0)から 10.2 分で別のまとまり。
    const dip = versions([10.2], [9], [7.5], [6], [4.5], [3], [1.5], [0], [1], [2], [3], [4], [5]);
    expect(shape(groupVersions(dip))).toEqual([['13', '12', '11', '10', '9', '8', '7', '6', '5', '4', '3', '2'], '1']);
    // 逆転が2分未満（並行した保存）なら同じまとまりに入る。
    expect(shape(groupVersions(versions([0], [1.5], [1])))).toEqual([['3', '2', '1']]);
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
