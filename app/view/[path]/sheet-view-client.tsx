'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import Header from '@/components/header';
import SkillSheetViewer from '@/components/skill-sheet-viewer';
import { ALL_VIEW_KEYS, ViewerTopbar, type ViewKey } from '@/components/viewer-topbar';
import type { Block } from '@/db/blocks';

interface SheetViewClientProps {
  title: string;
  content: string;
  blocks?: Block[];
  /** 編集者ログイン済みか。false（閲覧コードのみ等）のときは編集導線を出さない。 */
  canEdit?: boolean;
  /** 編集者判定の前後で編集ボタン分の幅を固定し、レイアウトずれを防ぐ。 */
  reserveEditSlot?: boolean;
  /**
   * true のとき、DB への再接続に失敗して古いキャッシュを表示している可能性があることを
   * 画面上部に案内する（Issue #204）。sheets-cache.ts の isDbContentStale() で判定する。
   */
  stale?: boolean;
}

const REVOKE_OBJECT_URL_DELAY_MS = 100;

const SheetViewClient = ({
  title,
  content,
  blocks,
  canEdit = false,
  reserveEditSlot = false,
  stale = false,
}: SheetViewClientProps) => {
  const [pdfLoading, setPdfLoading] = useState(false);
  // project ブロックを含むシートはダッシュボード扱いにし、Console トップバー＋ビュートグルを出す。
  // 意図的に raw blocks（中身が空でも）で判定する — skill-sheet-viewer.tsx の isDashboard と
  // 必ず揃えること（片方だけ直すとヘッダー/レイアウトがページ間で食い違う）。
  const isDashboard = useMemo(() => (blocks ?? []).some((b) => b.type === 'project'), [blocks]);
  // ビュー表示のON/OFF状態。初期値は全ビューON（トグルはダッシュボードのみ）。
  const [views, setViews] = useState<ViewKey[]>(() => [...ALL_VIEW_KEYS]);
  // トップバーに出す氏名・会社名はプロフィールブロックから引く。
  const profile = useMemo(
    () => (blocks ?? []).find((b): b is Extract<Block, { type: 'profile' }> => b.type === 'profile'),
    [blocks],
  );

  const toggleView = (view: ViewKey) => {
    setViews((prev) => (prev.includes(view) ? prev.filter((v) => v !== view) : [...prev, view]));
  };

  const handleDownloadPdf = async () => {
    const toastId = toast.loading('PDFを生成中…');
    try {
      setPdfLoading(true);

      const [{ pdf }, { SkillSheetPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/components/pdf-export'),
      ]);

      // blocks を渡すと印刷デザイン（会社セクション + 案件カード）で描かれる。
      // views は「押した瞬間のトグルの状態」で、永続化はしていない（DB に項目を足さない方針）。
      const blob = await pdf(<SkillSheetPDF title={title} content={content} blocks={blocks} views={views} />).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, REVOKE_OBJECT_URL_DELAY_MS);

      toast.success('PDFをダウンロードしました', { id: toastId });
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast.error('PDFの生成に失敗しました', { id: toastId });
      // フォント取得の失敗（オフライン・5xx 等）は @react-pdf/font 内で reject 済みの
      // Promise として永久にキャッシュされ、次のクリックも即座に同じ失敗を再現する
      // （リロードしないと直らない「詰み」状態になる）。失敗のたびに登録をリセットし、
      // 次のクリックで新しい FontSource から取得し直させる（フォント取得以外の失敗
      // でも安全 — 単に次回また登録し直すだけで副作用は無い）。
      const { resetPdfFontsAfterFailure } = await import('@/components/pdf/fonts');
      resetPdfFontsAfterFailure();
    } finally {
      setPdfLoading(false);
    }
  };

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
      {isDashboard ? (
        <ViewerTopbar
          name={profile?.data.name}
          company={profile?.data.company}
          views={views}
          onToggleView={toggleView}
          onDownloadPdf={handleDownloadPdf}
          pdfLoading={pdfLoading}
          canEdit={canEdit}
          reserveEditSlot={reserveEditSlot}
        />
      ) : (
        <Header
          onDownloadPdf={handleDownloadPdf}
          pdfLoading={pdfLoading}
          canEdit={canEdit}
          reserveEditSlot={reserveEditSlot}
          backHref="/view"
        />
      )}
      <SkillSheetViewer skillSheet={{ title, content }} blocks={blocks} views={isDashboard ? views : undefined} />
    </div>
  );
};

export default SheetViewClient;
