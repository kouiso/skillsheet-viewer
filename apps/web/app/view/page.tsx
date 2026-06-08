'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import Header from '@/component/header';
import SkillSheetViewer from '@/component/skill-sheet-viewer';
import { fetchSkillSheet } from '@/lib/skillsheet-client';

interface SkillSheet {
  title: string;
  content: string;
}

// オブジェクト URL の解放を遅延させる時間（ms）
const REVOKE_OBJECT_URL_DELAY_MS = 100;

const ViewPage = () => {
  const router = useRouter();
  const [skillSheet, setSkillSheet] = useState<SkillSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    // 認証チェック
    const isAuthenticated = sessionStorage.getItem('viewer-authenticated') === 'true';

    if (!isAuthenticated) {
      router.push('/viewer-auth');
      return;
    }

    // スキルシート取得
    const loadSkillSheet = async () => {
      try {
        setLoading(true);
        const viewerCode = sessionStorage.getItem('viewer-code') ?? undefined;
        const data = await fetchSkillSheet(viewerCode);
        setSkillSheet({ title: data.title, content: data.content });
        setError(null);
      } catch (err) {
        console.error('Error fetching skill sheet:', err);
        setError('エンジニアスキルシートの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    void loadSkillSheet();
  }, [router]);

  const handleDownloadPdf = async () => {
    if (!skillSheet) return;

    try {
      setPdfLoading(true);

      // @react-pdf/renderer はサイズが大きいため、ボタン押下時に動的 import して初期バンドルから分離する
      const [{ pdf }, { SkillSheetPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/component/pdf-export'),
      ]);

      const blob = await pdf(<SkillSheetPDF title={skillSheet.title} content={skillSheet.content} />).toBlob();

      // 生成した PDF をワンクリックでダウンロード（印刷ダイアログは使わない）
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'エンジニアスキルシート.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // 一部ブラウザでは click 直後の同期 revoke でダウンロードが失敗するため少し遅延させる
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
