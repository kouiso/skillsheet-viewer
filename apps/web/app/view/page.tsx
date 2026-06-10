'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { ArrowLeftRight, Loader2, Search } from 'lucide-react';

import Header from '@/component/header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AuthError, listSheets, type SheetMeta } from '@/lib/skillsheet-client';

const SheetsListPage = () => {
  const router = useRouter();
  const [sheets, setSheets] = useState<SheetMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await listSheets();
        setSheets(data);
      } catch (err) {
        if (err instanceof AuthError) {
          router.push('/viewer-auth');
          return;
        }
        setError('シート一覧の取得に失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [router]);

  const filtered = useMemo(
    () => sheets.filter((sheet) => sheet.title.toLowerCase().includes(query.toLowerCase())),
    [sheets, query],
  );

  const toggleSelect = (path: string) => {
    setSelected((prev) => {
      if (prev.includes(path)) return prev.filter((p) => p !== path);
      if (prev.length >= 2) return prev;
      return [...prev, path];
    });
  };

  const handleCompare = () => {
    if (selected.length !== 2) return;
    router.push(`/compare?a=${encodeURIComponent(selected[0])}&b=${encodeURIComponent(selected[1])}`);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-10 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-2 px-4 text-center">
        <h2 className="text-2xl font-bold">エラー</h2>
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <Header title="スキルシート一覧" />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="シート名で検索..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {selected.length === 2 && (
            <Button onClick={handleCompare} className="shrink-0">
              <ArrowLeftRight className="mr-2 size-4" />
              比較
            </Button>
          )}
        </div>

        {selected.length === 1 && (
          <p className="mb-3 text-sm text-muted-foreground">比較するシートをもう1件選択してください</p>
        )}

        <div className="rounded-lg border border-border bg-card shadow-sm">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">シートが見つかりません</p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((sheet) => (
                <li key={sheet.path} className="flex items-center gap-2 px-4 py-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => router.push(`/view/${encodeURIComponent(sheet.path)}`)}
                  >
                    <p className="truncate font-medium">{sheet.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{sheet.path}</p>
                  </button>
                  <input
                    type="checkbox"
                    aria-label={`${sheet.title}を比較選択`}
                    checked={selected.includes(sheet.path)}
                    onChange={() => toggleSelect(sheet.path)}
                    disabled={!selected.includes(sheet.path) && selected.length >= 2}
                    className="size-4 shrink-0 accent-primary"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default SheetsListPage;
