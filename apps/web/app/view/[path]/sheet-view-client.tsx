'use client';

import type { Block } from '@skillsheet/db/blocks';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import Header from '@/component/header';
import SkillSheetViewer from '@/component/skill-sheet-viewer';
import { ALL_VIEW_KEYS, type ViewKey, ViewerTopbar } from '@/component/viewer-topbar';

interface SheetViewClientProps {
  title: string;
  content: string;
  blocks?: Block[];
}

const REVOKE_OBJECT_URL_DELAY_MS = 100;

const SheetViewClient = ({ title, content, blocks }: SheetViewClientProps) => {
  const [pdfLoading, setPdfLoading] = useState(false);
  // project ブロックを含むシートはダッシュボード扱いにし、Console トップバー＋ビュートグルを出す。
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
    try {
      setPdfLoading(true);

      const [{ pdf }, { SkillSheetPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/component/pdf-export'),
      ]);

      const blob = await pdf(<SkillSheetPDF title={title} content={content} />).toBlob();

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

      toast.success('PDFをダウンロードしました');
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast.error('PDFの生成に失敗しました');
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div>
      {isDashboard ? (
        <ViewerTopbar
          name={profile?.data.name}
          company={profile?.data.company}
          views={views}
          onToggleView={toggleView}
          onDownloadPdf={handleDownloadPdf}
          pdfLoading={pdfLoading}
        />
      ) : (
        <Header onDownloadPdf={handleDownloadPdf} pdfLoading={pdfLoading} />
      )}
      <SkillSheetViewer skillSheet={{ title, content }} blocks={blocks} views={isDashboard ? views : undefined} />
    </div>
  );
};

export default SheetViewClient;
