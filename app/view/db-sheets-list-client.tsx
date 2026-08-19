'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CONFIG_ERROR_NOTICES, ConfigErrorNotice } from '@/component/config-error-notice';
import Header from '@/component/header';
import { Input } from '@/components/ui/input';
import type { SheetSummary } from '@/db/skillsheet';
import type { ConfigErrorKind } from '@/util/is-config-error';

interface DbSheetsListClientProps {
  initialSheets: SheetSummary[];
  errorKind?: ConfigErrorKind | null;
  /** 編集者ログイン済みか。false のときは編集導線を出さない。 */
  canEdit?: boolean;
  /**
   * true のとき、DB への再接続に失敗して古い一覧を表示している可能性があることを
   * 画面上部に案内する（Issue #204 の一覧版。sheet-view-client.tsx と同じ文言・見た目）。
   */
  stale?: boolean;
}

const DbSheetsListClient = ({
  initialSheets,
  errorKind = null,
  canEdit = false,
  stale = false,
}: DbSheetsListClientProps) => {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const filtered = useMemo(
    () => initialSheets.filter((sheet) => sheet.title.toLowerCase().includes(query.toLowerCase())),
    [initialSheets, query],
  );

  // 他の DB 正本経路（/view/db・/view/db/[id]）と同じ見た目・同じ原因別の案内文を出す
  // （config-error-notice.tsx の doc comment 参照。以前は真偽値だけ見て固定の汎用文言
  // しか出せず、書式ミス等でも「未設定」向けの案内になっていた。Codex レビュー指摘）。
  if (errorKind) {
    return <ConfigErrorNotice {...CONFIG_ERROR_NOTICES[errorKind]} />;
  }

  return (
    <div>
      {stale && (
        <div
          role="status"
          className="border-b border-warn/40 bg-warn-soft px-4 py-2 text-center text-sm text-warn-strong"
        >
          表示中の内容はしばらく更新されていない可能性があります。最新の状態と異なる場合があります。
        </div>
      )}
      <Header title="スキルシート一覧" canEdit={canEdit} />
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
          {filtered.length === 0 ? (
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
