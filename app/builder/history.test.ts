import { beforeEach, describe, expect, it } from 'vitest';
import type { ProjectBlockData, ProjectItem } from '@/db/blocks';

import {
  describeChange,
  formatHistoryTime,
  HISTORY_LIMIT,
  historyStorageKey,
  loadHistory,
  pushHistory,
} from './history';

const project = (over: Partial<ProjectItem> = {}): ProjectItem => ({
  id: 'p1',
  companyId: 'c1',
  title: '案件A',
  scope: 'Web',
  period: '2024.01 — 2024.06',
  role: 'SE',
  team: '5',
  tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] },
  process: [],
  duties: '',
  acquired: '',
  comment: '',
  summary: '',
  duration: '6ヶ月',
  ...over,
});

const data = (over: Partial<ProjectBlockData> = {}): ProjectBlockData => ({
  companies: [{ id: 'c1', name: '甲社', kind: '受託', period: '', note: '' }],
  items: [project()],
  ...over,
});

describe('describeChange', () => {
  it('案件の追加・削除を件数の増減から判別する', () => {
    const before = data();
    const after = data({ items: [project(), project({ id: 'p2', title: '案件B' })] });
    expect(describeChange(before, after)).toBe('案件「案件B」を追加');
    expect(describeChange(after, before)).toBe('案件「案件B」を削除');
  });

  it('会社の追加・削除を件数の増減から判別する', () => {
    const before = data();
    const after = data({
      companies: [...data().companies, { id: 'c2', name: '乙社', kind: '受託', period: '', note: '' }],
    });
    expect(describeChange(before, after)).toBe('会社「乙社」を追加');
    expect(describeChange(after, before)).toBe('会社「乙社」を削除');
  });

  it('構成が同じで順番だけ違う場合は並び替えと判別する', () => {
    const a = project();
    const b = project({ id: 'p2', title: '案件B' });
    expect(describeChange(data({ items: [a, b] }), data({ items: [b, a] }))).toBe('案件を並び替え');
  });

  it('hidden の反転は表示/非表示として出す（フィールド編集に混ぜない）', () => {
    const before = data();
    const after = data({ items: [project({ hidden: true })] });
    expect(describeChange(before, after)).toBe('案件「案件A」を非表示に');
    expect(describeChange(after, before)).toBe('案件「案件A」を表示に');
  });

  it('編集されたフィールドを日本語で最大2件 + 残数として出す', () => {
    const before = data();
    const after = data({ items: [project({ title: '案件A2', role: 'PL', comment: 'メモ', duties: '実装' })] });
    // title → タイトル / role → 役割 / comment → コメント / duties → 担当業務 の4件
    expect(describeChange(before, after)).toBe('「案件A2」のタイトル・役割 ほか2件を編集');
  });

  it('期間まわりの複数キーは「期間」1件にまとめる', () => {
    const before = data();
    const after = data({
      items: [project({ periodStart: '2024-01', periodEnd: '2024-08', period: '2024.01 — 2024.08' })],
    });
    expect(describeChange(before, after)).toBe('「案件A」の期間を編集');
  });

  it('件数が同じでも中身が入れ替わっていれば差し替えとして出す', () => {
    const before = data();
    const after = data({ items: [project({ id: 'p9', title: '案件Z' })] });
    expect(describeChange(before, after)).toBe('案件「案件Z」へ差し替え');
  });
});

describe('pushHistory', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('新しいものが先頭に積まれ、localStorage へ保存される', () => {
    const t0 = 1_700_000_000_000;
    pushHistory(data(), data({ items: [project({ title: 'A2' })] }), t0);
    const list = pushHistory(data(), data({ items: [project({ role: 'PL' })] }), t0 + 200_000);
    expect(list).toHaveLength(2);
    expect(list[0].label).toBe('「案件A」の役割を編集');
    expect(loadHistory()).toHaveLength(2);
  });

  // マージ判定はラベルの一致で行う。ラベルには案件名が入るため、案件名そのものを打っている間は
  // 1打ごとにラベルが変わってまとまらない（設計どおり）。長文を打ち続けるコメント欄がマージ対象。
  it('90秒以内の同じラベルは1件へまとめる（連続入力で埋め尽くさない）', () => {
    const t0 = 1_700_000_000_000;
    pushHistory(data(), data({ items: [project({ comment: 'メ' })] }), t0);
    const list = pushHistory(data(), data({ items: [project({ comment: 'メモ' })] }), t0 + 10_000);
    expect(list).toHaveLength(1);
    expect(list[0].snapshot.items[0].comment).toBe('メモ');
  });

  it('90秒を超えたら同じラベルでも別件として積む', () => {
    const t0 = 1_700_000_000_000;
    pushHistory(data(), data({ items: [project({ comment: 'メ' })] }), t0);
    const list = pushHistory(data(), data({ items: [project({ comment: 'メモ' })] }), t0 + 91_000);
    expect(list).toHaveLength(2);
  });

  it('上限を超えたぶんは古いほうから捨てる', () => {
    let t = 1_700_000_000_000;
    let list: ReturnType<typeof pushHistory> = [];
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      t += 100_000;
      list = pushHistory(data(), data({ items: [project({ title: `A${i}`, role: `R${i}` })] }), t);
    }
    expect(list).toHaveLength(HISTORY_LIMIT);
  });

  it('保存済みデータが壊れていても空として扱い、編集を止めない', () => {
    window.localStorage.setItem(historyStorageKey(), '{壊れたJSON');
    expect(loadHistory()).toEqual([]);
  });

  it('シートごとに保存先を分ける（別シートの履歴で上書きしない）', () => {
    const t0 = 1_700_000_000_000;
    pushHistory(data(), data({ items: [project({ title: 'A2' })] }), t0, 'sheet-a');
    pushHistory(data(), data({ items: [project({ title: 'B2' })] }), t0, 'sheet-b');
    expect(loadHistory('sheet-a')).toHaveLength(1);
    expect(loadHistory('sheet-a')[0].snapshot.items[0].title).toBe('A2');
    expect(loadHistory('sheet-b')[0].snapshot.items[0].title).toBe('B2');
  });

  it('各エントリに安定した id が付く', () => {
    const t0 = 1_700_000_000_000;
    const list = pushHistory(data(), data({ items: [project({ title: 'A2' })] }), t0, 's');
    expect(list[0].id).toBeTruthy();
  });
});

describe('formatHistoryTime', () => {
  const now = new Date(2026, 6, 26, 14, 30).getTime();

  it('1分未満は「たった今」', () => {
    expect(formatHistoryTime(now - 30_000, now)).toBe('たった今');
  });

  it('1時間未満は「N分前」', () => {
    expect(formatHistoryTime(now - 25 * 60_000, now)).toBe('25分前');
  });

  it('同じ日は「今日 HH:MM」', () => {
    expect(formatHistoryTime(new Date(2026, 6, 26, 9, 5).getTime(), now)).toBe('今日 09:05');
  });

  it('別の日は「M/D HH:MM」', () => {
    expect(formatHistoryTime(new Date(2026, 6, 24, 9, 5).getTime(), now)).toBe('7/24 09:05');
  });
});
