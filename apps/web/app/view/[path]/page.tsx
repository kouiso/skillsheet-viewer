'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import Header from '@/component/header';
import SkillSheetViewer from '@/component/skill-sheet-viewer';
import { AuthError, fetchSheet } from '@/lib/skillsheet-client';

interface SkillSheet {
  title: string;
  content: string;
}

const REVOKE_OBJECT_URL_DELAY_MS = 100;

const SheetViewPage = () => {
  const router = useRouter();
  const params = useParams<{ path?: string | string[] }>();
  const rawPath = params.path;
  const path = Array.isArray(rawPath) ? rawPath[0] : rawPath;
  const [skillSheet, setSkillSheet] = useState<SkillSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!path) {
      router.push('/view');
      return;
    }

    const loadSkillSheet = async () => {
      try {
        setLoading(true);
        const data = await fetchSheet(path);
        setSkillSheet({ title: data.title, content: data.content });
        setError(null);
      } catch (err) {
        if (err instanceof AuthError) {
          router.push('/viewer-auth');
          return;
        }
        console.error('Error fetching skill sheet:', err);
        setError('スキルシートの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    void loadSkillSheet();
  }, [router, path]);

  const handleDownloadPdf = async () => {
    if (!skillSheet) return;

    try {
      setPdfLoading(true);

      const [{ pdf }, { SkillSheetPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/component/pdf-export'),
      ]);

      const blob = await pdf(<SkillSheetPDF title={skillSheet.title} content={skillSheet.content} />).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${skillSheet.title}.pdf`;
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

  if (!skillSheet) return null;

  return (
    <div>
      <Header onDownloadPdf={handleDownloadPdf} pdfLoading={pdfLoading} />
      <SkillSheetViewer skillSheet={skillSheet} />
    </div>
  );
};

export default SheetViewPage;
