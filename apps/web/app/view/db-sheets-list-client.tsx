'use client';

import type { SheetSummary } from '@skillsheet/db';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import Header from '@/component/header';
import { Input } from '@/components/ui/input';

interface DbSheetsListClientProps {
  initialSheets: SheetSummary[];
  hasError?: boolean;
}

const DbSheetsListClient = ({ initialSheets, hasError = false }: DbSheetsListClientProps) => {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () => initialSheets.filter((sheet) => sheet.title.toLowerCase().includes(query.toLowerCase())),
    [initialSheets, query],
  );

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
        </div>

        <div className="rounded-lg border border-border bg-card shadow-sm">
          {hasError ? (
            <div className="space-y-2 px-4 py-6 text-center text-sm">
              <p className="text-destructive">一覧の取得に失敗しました。</p>
              <p className="text-muted-foreground text-xs">
                環境変数 DATABASE_URL / SKILLSHEET_OWNER_ID を確認し、pnpm db:migrate を実行してください。
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {initialSheets.length === 0
                ? 'シートがまだありません（ビルダーで作成してください）'
                : 'シートが見つかりません'}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((sheet) => (
                <li key={sheet.id} className="px-4 py-3">
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => router.push(`/view/db/${encodeURIComponent(sheet.id)}`)}
                  >
                    <p className="truncate font-medium">{sheet.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      更新: {new Date(sheet.updatedAt).toLocaleDateString('ja-JP')}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default DbSheetsListClient;
