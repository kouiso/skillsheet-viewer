import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import Header from '@/component/header';
import SkillSheetViewer from '@/component/skill-sheet-viewer';
import { fetchSheet, AuthError } from '@/lib/github-client';

interface SkillSheet {
  title: string;
  content: string;
}

const REVOKE_OBJECT_URL_DELAY_MS = 100;

const ViewPage = () => {
  const navigate = useNavigate();
  const { path } = useParams<{ path: string }>();
  const [skillSheet, setSkillSheet] = useState<SkillSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!path) {
      void navigate('/view');
      return;
    }

    const loadSkillSheet = async () => {
      try {
        setLoading(true);
        const data = await fetchSheet(path);
        const firstHeading = data.content.match(/^#\s+(.+)$/m);
        const title = firstHeading ? firstHeading[1].trim() : path.replace(/\.md$/, '');
        setSkillSheet({ title, content: data.content });
        setError(null);
      } catch (err) {
        if (err instanceof AuthError) {
          void navigate('/viewer-auth');
          return;
        }
        console.error('Error fetching skill sheet:', err);
        setError('スキルシートの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    void loadSkillSheet();
  }, [navigate, path]);

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
      link.download = 'エンジニアスキルシート.pdf';
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

  if (!skillSheet) {
    return null;
  }

  return (
    <div>
      <Header onDownloadPdf={handleDownloadPdf} pdfLoading={pdfLoading} />
      <SkillSheetViewer skillSheet={skillSheet} />
    </div>
  );
};

export default ViewPage;
