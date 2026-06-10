'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Loader2 } from 'lucide-react';

import Header from '@/component/header';
import SkillSheetViewer from '@/component/skill-sheet-viewer';
import { fetchSheet } from '@/lib/skillsheet-client';

interface Sheet {
  title: string;
  content: string;
}

const CompareClient = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathA = searchParams.get('a') ?? '';
  const pathB = searchParams.get('b') ?? '';

  const [sheetA, setSheetA] = useState<Sheet | null>(null);
  const [sheetB, setSheetB] = useState<Sheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pathA || !pathB) {
      router.push('/view');
      return;
    }

    const load = async () => {
      try {
        const [dataA, dataB] = await Promise.all([fetchSheet(pathA), fetchSheet(pathB)]);
        setSheetA({ title: dataA.title, content: dataA.content });
        setSheetB({ title: dataB.title, content: dataB.content });
      } catch {
        setError('シートの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [router, pathA, pathB]);

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

  if (!sheetA || !sheetB) return null;

  return (
    <div>
      <Header title="スキルシート比較" />
      <div className="flex min-h-[calc(100vh-64px)] flex-col md:flex-row">
        <div className="flex-1 border-b border-border md:border-b-0 md:border-r">
          <SkillSheetViewer skillSheet={sheetA} compareMode />
        </div>
        <div className="flex-1">
          <SkillSheetViewer skillSheet={sheetB} compareMode />
        </div>
      </div>
    </div>
  );
};

export default CompareClient;
