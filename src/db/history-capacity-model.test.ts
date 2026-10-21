import { describe, expect, it } from 'vitest';
import {
  DAYS_PER_MONTH,
  isActiveDay,
  type LoadProfile,
  MB,
  MIB,
  maxVersionsInWindow,
  monthlyNewVersions,
  monthsUntilLimit,
  projectCapacity,
  retainedVersionsPerSheet,
  retainedWalBytes,
  sensitivity,
  toMB,
  toMiB,
} from './history-capacity-model';

const everyDay: LoadProfile = {
  sheets: 1,
  activeDaysPerMonth: 30,
  savesPerActiveDay: 10,
  nonSaveVersionsPerSheetPerMonth: 0,
};

describe('月間版数', () => {
  it('シート数 × 活動日 × 保存数 ＋ save 以外の版で数える', () => {
    expect(
      monthlyNewVersions({
        sheets: 3,
        activeDaysPerMonth: 10,
        savesPerActiveDay: 30,
        nonSaveVersionsPerSheetPerMonth: 2,
      }),
    ).toBe(906);
  });
  it('活動日は30日の中で指定日数だけ、決まった日に置く', () => {
    for (const active of [0, 1, 4, 10, 15, 29, 30]) {
      const days = Array.from({ length: DAYS_PER_MONTH }, (_, day) => isActiveDay(day, active)).filter(Boolean).length;
      expect(days).toBe(active);
    }
    expect(isActiveDay(29, 1)).toBe(true);
    expect(isActiveDay(59, 1)).toBe(true);
  });
  it('負の値・小数のシート数・31日以上の活動日を拒否する', () => {
    expect(() => monthlyNewVersions({ ...everyDay, sheets: -1 })).toThrow(RangeError);
    expect(() => monthlyNewVersions({ ...everyDay, sheets: 1.5 })).toThrow(RangeError);
    expect(() => monthlyNewVersions({ ...everyDay, activeDaysPerMonth: 31 })).toThrow(RangeError);
    expect(() => monthlyNewVersions({ ...everyDay, savesPerActiveDay: Number.NaN })).toThrow(RangeError);
  });
});

describe('保持案ごとの残る版数', () => {
  it('全版保持は baseline 1 ＋ 全 save ＋ save 以外の版', () => {
    const load = { ...everyDay, nonSaveVersionsPerSheetPerMonth: 3 };
    expect(retainedVersionsPerSheet(load, { kind: 'keep-all' }, 60)).toBe(1 + 600 + 6);
  });
  it('期間制限でも save 以外の版は消えず、月数に比例して増え続ける', () => {
    const load = { ...everyDay, nonSaveVersionsPerSheetPerMonth: 2 };
    const at3 = retainedVersionsPerSheet(load, { kind: 'window', keepDays: 30 }, 90);
    const at12 = retainedVersionsPerSheet(load, { kind: 'window', keepDays: 30 }, 360);
    expect(at3).toBe(1 + 300 + 6);
    expect(at12).toBe(1 + 300 + 24);
  });
  it('段階的間引きは全版・日1版・月1版を足す（日・月の代表は最後の save 1版）', () => {
    // 400日: 直近30日は全版 300、30〜364日は1日1版 335、365日以上前（0〜34日目）は月の区切り 0 と 1 の2版。
    expect(retainedVersionsPerSheet(everyDay, { kind: 'tiered', fullDays: 30, dailyUntilDays: 365 }, 400)).toBe(
      1 + 300 + 335 + 2,
    );
  });
  it('期間外になっても各シートの最新版は残す', () => {
    const sparse = { ...everyDay, activeDaysPerMonth: 1 };
    // 活動日は29日目だけ。40日目には保存から10日経ち、5日の期間を外れる。
    expect(retainedVersionsPerSheet(sparse, { kind: 'window', keepDays: 5 }, 40)).toBe(1 + 1);
  });
  it('保存が一度も無ければ baseline だけ', () => {
    expect(retainedVersionsPerSheet({ ...everyDay, activeDaysPerMonth: 0 }, { kind: 'keep-all' }, 300)).toBe(1);
  });
  it('不正な保持案を拒否する', () => {
    expect(() => retainedVersionsPerSheet(everyDay, { kind: 'window', keepDays: 0 }, 10)).toThrow(RangeError);
    expect(() => retainedVersionsPerSheet(everyDay, { kind: 'tiered', fullDays: 30, dailyUntilDays: 7 }, 10)).toThrow(
      RangeError,
    );
    expect(() => retainedVersionsPerSheet(everyDay, { kind: 'keep-all' }, -1)).toThrow(RangeError);
  });
});

describe('容量の予測', () => {
  const storage = { bytesPerVersion: 100_000, nonHistoryBytes: 10 * MIB, limitBytes: 100 * MIB };
  it('月末ごとの容量を出し、上限を超えた月を返す', () => {
    const points = projectCapacity(everyDay, storage, { kind: 'keep-all' }, 3);
    expect(points.map((point) => point.versions)).toEqual([301, 601, 901]);
    expect(points[0]?.totalBytes).toBe(301 * 100_000 + 10 * MIB);
    // 1か月 30.1MB、2か月 60.1MB、3か月 90.1MB(=85.9MiB)+10MiB = 95.9MiB、4か月目で上限超え。
    expect(monthsUntilLimit(everyDay, storage, { kind: 'keep-all' })).toBe(4);
  });
  it('期間制限で増分が止まっても、save 以外の版が積み上がれば上限到達はあり得る', () => {
    const load = { ...everyDay, nonSaveVersionsPerSheetPerMonth: 30 };
    const months = monthsUntilLimit(load, storage, { kind: 'window', keepDays: 30 }, 240);
    expect(months).not.toBeNull();
    expect(monthsUntilLimit(everyDay, storage, { kind: 'window', keepDays: 30 }, 240)).toBeNull();
  });
  it('horizon 内に届かなければ null を返す', () => {
    expect(monthsUntilLimit({ ...everyDay, savesPerActiveDay: 0 }, storage, { kind: 'keep-all' }, 12)).toBeNull();
  });
  it('感度分析は前提を1つずつ変えて並べる', () => {
    const rows = sensitivity(everyDay, storage, { kind: 'keep-all' }, [
      { label: '基準' },
      { label: '保存数 ×2', load: { savesPerActiveDay: 20 } },
      { label: '1版を半分', storage: { bytesPerVersion: 50_000 } },
    ]);
    expect(rows.map((row) => row.monthlyNewBytes)).toEqual([30_000_000, 60_000_000, 15_000_000]);
    expect(rows[1]?.monthsUntilLimit).toBe(2);
  });
  it('感度分析の行で保持案を差し替えられ、残る履歴は間引き後の量になる', () => {
    const tiered = { kind: 'tiered', fullDays: 30, dailyUntilDays: 365 } as const;
    const [keepAll, tieredRow] = sensitivity(
      everyDay,
      storage,
      { kind: 'keep-all' },
      [{ label: '基準' }, { label: '段階的間引き', policy: tiered }],
      14,
    );
    // 新しく作られる版は保持案に関係なく同じ。
    expect(tieredRow?.monthlyNewBytes).toBe(keepAll?.monthlyNewBytes);
    expect(keepAll?.historyBytesAtMonth).toBe((1 + 4200) * 100_000);
    // 420日: 全版 300 ＋ 日1版 335 ＋ 月1版（0・1 月目）2 ＋ baseline 1。
    expect(tieredRow?.historyBytesAtMonth).toBe((1 + 300 + 335 + 2) * 100_000);
    expect(tieredRow?.monthsUntilLimit).toBeNull();
  });
  it('段階的間引きでも月次版は1か月1版ずつ積み上がる', () => {
    const tiered = { kind: 'tiered', fullDays: 30, dailyUntilDays: 365 } as const;
    const at24 = retainedVersionsPerSheet(everyDay, tiered, 24 * DAYS_PER_MONTH);
    const at36 = retainedVersionsPerSheet(everyDay, tiered, 36 * DAYS_PER_MONTH);
    expect(at36 - at24).toBe(12);
  });
});

describe('PITR 保持窓の WAL', () => {
  it('窓に入る版の最大数 × 1版の WAL を返す', () => {
    // 月10日活動（3日に1日）で7日窓なら、最も混む窓に活動日が3日入る。
    const load = { sheets: 2, activeDaysPerMonth: 10, savesPerActiveDay: 30, nonSaveVersionsPerSheetPerMonth: 0 };
    expect(maxVersionsInWindow(load, 7)).toBe(2 * 3 * 30);
    expect(retainedWalBytes(load, 1000, 7)).toBe(2 * 3 * 30 * 1000);
  });
  it('1日未満の窓はその日の save が全部入る側で数え、save 以外の版は日割りする', () => {
    const load = { sheets: 1, activeDaysPerMonth: 10, savesPerActiveDay: 30, nonSaveVersionsPerSheetPerMonth: 30 };
    expect(maxVersionsInWindow(load, 0.25)).toBe(30 + 0.25);
    expect(maxVersionsInWindow(load, 30)).toBe(300 + 30);
  });
  it('窓の長さが0以下・非数なら拒否する', () => {
    expect(() => maxVersionsInWindow(everyDay, 0)).toThrow(RangeError);
    expect(() => maxVersionsInWindow(everyDay, Number.NaN)).toThrow(RangeError);
    expect(() => retainedWalBytes(everyDay, -1, 1)).toThrow(RangeError);
  });
});

describe('単位', () => {
  it('MiB と MB を取り違えない', () => {
    expect(toMiB(MIB)).toBe(1);
    expect(toMB(MIB)).toBeCloseTo(1.048576);
    expect(toMiB(1024 * MB)).toBeCloseTo(976.5625);
  });
});
