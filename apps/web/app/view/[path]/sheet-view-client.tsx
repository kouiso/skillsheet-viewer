'use client';

import { useState } from 'react';

import { toast } from 'sonner';

import type { Block } from '@skillsheet/db/blocks';
import Header from '@/component/header';
import SkillSheetViewer from '@/component/skill-sheet-viewer';

interface SheetViewClientProps {
  title: string;
  content: string;
  blocks?: Block[];
}

const REVOKE_OBJECT_URL_DELAY_MS = 100;

const SheetViewClient = ({ title, content, blocks }: SheetViewClientProps) => {
  const [pdfLoading, setPdfLoading] = useState(false);

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
      <Header onDownloadPdf={handleDownloadPdf} pdfLoading={pdfLoading} />
      <SkillSheetViewer skillSheet={{ title, content }} blocks={blocks} />
    </div>
  );
};

export default SheetViewClient;
