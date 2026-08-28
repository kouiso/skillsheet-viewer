import Link from 'next/link';

import { Button } from '@/components/ui/button';

// 存在しないシートID/パスや未定義ルートへのアクセス時に表示される。
// app/layout.tsx にネストされるため ThemeModeProvider 配下でテーマに追従する。
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h2 className="text-2xl font-bold">ページが見つかりません</h2>
      <p className="text-muted-foreground">指定されたスキルシートは存在しないか、移動した可能性があります。</p>
      <Button asChild>
        <Link href="/view">シート一覧に戻る</Link>
      </Button>
    </div>
  );
}
