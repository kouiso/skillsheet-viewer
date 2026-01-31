import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { pdf } from '@react-pdf/renderer';
import { Loader2 } from 'lucide-react';

import Header from '@/component/header';
import SkillSheetViewer from '@/component/skill-sheet-viewer';
import { SkillSheetPDF } from '@/component/pdf-export';
import { Toast } from '@/components/ui/toast';
import { fetchSkillSheet } from '@/lib/github-client';

interface SkillSheet {
  title: string;
  content: string;
}

const ViewPage = () => {
  const navigate = useNavigate();
  const [skillSheet, setSkillSheet] = useState<SkillSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVariant, setToastVariant] = useState<'success' | 'error'>('success');

  useEffect(() => {
    // Check authentication
    const isAuthenticated = sessionStorage.getItem('viewer-authenticated') === 'true';

    if (!isAuthenticated) {
      void navigate('/viewer-auth');
      return;
    }

    // Fetch skill sheet
    const loadSkillSheet = async () => {
      try {
        setLoading(true);
        const data = await fetchSkillSheet();
        setSkillSheet({
          title: 'エンジニアスキルシート',
          content: data.content,
        });
        setError(null);
      } catch (err) {
        console.error('Error fetching skill sheet:', err);
        setError('エンジニアスキルシートの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    void loadSkillSheet();
  }, [navigate]);

  const handleDownloadPdf = async () => {
    if (!skillSheet) return;

    try {
      setPdfLoading(true);
      setToastMessage('PDFを生成中...');
      setToastVariant('success');
      setToastOpen(true);

      // PDFドキュメントを生成
      const pdfDocument = <SkillSheetPDF title={skillSheet.title} content={skillSheet.content} />;
      const blob = await pdf(pdfDocument).toBlob();

      // ダウンロード
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `スキルシート_${skillSheet.title}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setToastMessage('PDFのダウンロードが完了しました');
      setToastVariant('success');
      setToastOpen(true);
    } catch (err) {
      console.error('Error generating PDF:', err);
      setToastMessage('PDFの生成に失敗しました');
      setToastVariant('error');
      setToastOpen(true);
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center min-h-screen flex-col gap-4">
        <h1 className="text-2xl font-bold">エラー</h1>
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

      {/* Toast for notifications */}
      <Toast
        open={toastOpen}
        message={toastMessage}
        variant={toastVariant}
        onClose={() => setToastOpen(false)}
      />
    </div>
  );
};

export default ViewPage;
