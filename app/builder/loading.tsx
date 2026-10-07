export default function Loading() {
  return (
    <main className="min-h-screen bg-background text-foreground" aria-busy="true">
      <div
        role="status"
        className="flex min-h-14 items-center border-b border-border bg-card px-4 text-sm font-semibold"
      >
        編集画面を読み込み中
      </div>
      <div
        aria-hidden="true"
        className="grid min-h-[calc(100dvh-56px)] grid-cols-1 lg:grid-cols-[268px_minmax(0,1fr)_384px]"
      >
        <div className="hidden space-y-4 border-r border-border bg-card p-5 lg:block">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="h-11 rounded bg-muted motion-safe:animate-pulse" />
          ))}
        </div>
        <div className="space-y-6 p-5 sm:p-8">
          <div className="h-7 w-1/2 rounded bg-muted motion-safe:animate-pulse" />
          {[1, 2, 3, 4].map((row) => (
            <div key={row} className="space-y-2">
              <div className="h-4 w-1/3 rounded bg-muted motion-safe:animate-pulse" />
              <div className="h-20 rounded border border-border bg-card motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
        <div className="hidden border-l border-border bg-card p-5 lg:block">
          <div className="h-5 w-1/2 rounded bg-muted motion-safe:animate-pulse" />
          <div className="mt-6 h-80 rounded border border-border bg-background motion-safe:animate-pulse" />
        </div>
      </div>
    </main>
  );
}
