import { afterEach, describe, expect, it, vi } from 'vitest';

import { SkillSheetNotFoundError } from '@/db';

import { isDbContentStale, withDbHealthCheck } from './sheets-cache';

// DB_REVALIDATE_SECONDS(60) * 3 = 180秒がしきい値（sheets-cache.ts 参照）。
// 実装の定数を変更した場合はここも合わせて調整すること。
const STALE_THRESHOLD_MS = 180_000;

describe('isDbContentStale', () => {
  it('しきい値より新しい取得時刻は stale と判定しない', () => {
    expect(isDbContentStale(Date.now() - (STALE_THRESHOLD_MS - 1_000))).toBe(false);
  });

  it('しきい値より古い取得時刻は stale と判定する（直接問い合わせのトリガー）', () => {
    expect(isDbContentStale(Date.now() - (STALE_THRESHOLD_MS + 1_000))).toBe(true);
  });

  it('取得直後（現在時刻）は stale と判定しない', () => {
    expect(isDbContentStale(Date.now())).toBe(false);
  });
});

// withDbHealthCheck: fetchedAt の経過時間を「疑わしいので直接問い合わせて確認する」
// トリガーにのみ使い、画面へ出す stale は直接問い合わせの成否で決める本体（実測欠陥の修正）。
//
// 赤くなることを確認済み: aged なキャッシュを liveFetch の成否に関わらずそのまま返す
// （= 元の「fetchedAt の経過時間だけで stale を決める」実装に戻す）と、下の
// 「直接問い合わせが成功すれば〜」テストが red になる（成功しても fetchedAt が
// 更新されず isDbContentStale が true のまま＝古い DB で健全なのに stale 扱いという
// 元の誤検知が再現する）。手を入れるときは同じ壊し方でもう一度赤を見ること。
describe('withDbHealthCheck', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fresh なキャッシュはそのまま返し、直接問い合わせしない', async () => {
    const cached = { value: 'x', fetchedAt: Date.now() };
    const liveFetch = vi.fn();

    const result = await withDbHealthCheck(cached, liveFetch);

    expect(result).toBe(cached);
    expect(liveFetch).not.toHaveBeenCalled();
  });

  it('古いキャッシュでも直接問い合わせが成功すれば、健全な証拠として fetchedAt を更新する', async () => {
    const cached = { value: 'old', fetchedAt: Date.now() - (STALE_THRESHOLD_MS + 1_000) };
    const liveFetch = vi.fn().mockResolvedValue({ value: 'fresh' });

    const result = await withDbHealthCheck(cached, liveFetch);

    expect(liveFetch).toHaveBeenCalledOnce();
    expect(result.value).toBe('fresh');
    // 低頻度アクセスで健全な DB を stale 扱いしていた誤検知が消えたことの証明。
    expect(isDbContentStale(result.fetchedAt)).toBe(false);
  });

  it('古いキャッシュで直接問い合わせも失敗すれば、古い値のまま返す（本物の stale signal）', async () => {
    const cached = { value: 'old', fetchedAt: Date.now() - (STALE_THRESHOLD_MS + 1_000) };
    const liveFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await withDbHealthCheck(cached, liveFetch);

    expect(result).toBe(cached);
    expect(isDbContentStale(result.fetchedAt)).toBe(true);
  });

  it('SkillSheetNotFoundError は DB 到達性の失敗として握り潰さず re-throw する', async () => {
    const cached = { value: 'old', fetchedAt: Date.now() - (STALE_THRESHOLD_MS + 1_000) };
    const liveFetch = vi.fn().mockRejectedValue(new SkillSheetNotFoundError('gone'));

    // 握り潰すと、削除済みシートを「古いキャッシュ」として stale バナー付きで
    // 復活表示してしまう（sheets-cache.ts の withDbHealthCheck 参照）。
    await expect(withDbHealthCheck(cached, liveFetch)).rejects.toBeInstanceOf(SkillSheetNotFoundError);
  });

  it('直接問い合わせが固まって返らないときも、有限時間で古い値へフォールバックする', async () => {
    vi.useFakeTimers();
    const cached = { value: 'old', fetchedAt: Date.now() - (STALE_THRESHOLD_MS + 1_000) };
    const liveFetch = vi.fn().mockReturnValue(new Promise<never>(() => {})); // 永遠に解決しない

    const resultPromise = withDbHealthCheck(cached, liveFetch);
    // 本番のタイムアウト（5秒）より十分大きく進める。
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await resultPromise;

    expect(result).toBe(cached);
  });
});
