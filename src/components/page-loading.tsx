/**
 * ルートセグメントの読み込み中に出す共通の骨組み。
 *
 * これまで `loading.tsx` が 1 つも無く、DB / GitHub からの取得が終わるまで
 * 前の画面のまま止まるか真っ白になっていた。「止まっている」のか「読み込み中」なのかが
 * 分からないと、面接の場では壊れているように見える。
 */
export function PageLoading({ label = '読み込み中…', rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pt-8 pb-16 sm:px-8 sm:pt-11" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="animate-pulse space-y-6">
        <div className="h-7 w-2/5 rounded bg-muted" />
        <div className="h-4 w-3/5 rounded bg-muted" />
        <div className="space-y-4 pt-4">
          {Array.from({ length: rows }, (_, i) => `skeleton-row-${i}`).map((key) => (
            <div key={key} className="rounded-[var(--radius-lg)] border border-border bg-card p-5">
              <div className="h-4 w-1/3 rounded bg-muted" />
              <div className="mt-3 h-3 w-full rounded bg-muted" />
              <div className="mt-2 h-3 w-4/5 rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
