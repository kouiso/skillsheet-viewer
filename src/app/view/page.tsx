import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { fetchSkillSheet } from '@/lib/github';

import SkillSheetViewer from './SkillSheetViewer';

export default async function ViewPage() {
  // Check if user has valid session
  const cookieStore = await cookies();
  const hasSession = cookieStore.has('viewer-session');

  if (!hasSession) {
    redirect('/viewer-auth');
  }

  // Fetch skill sheet from GitHub
  const skillSheetData = await fetchSkillSheet().catch((error: Error) => {
    console.error('Error fetching skill sheet:', error);
    return null;
  });

  if (!skillSheetData) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>エラー</h1>
        <p>スキルシートの読み込みに失敗しました。</p>
      </div>
    );
  }

  const skillSheet = {
    title: 'スキルシート',
    content: skillSheetData.content,
  };

  return <SkillSheetViewer skillSheet={skillSheet} />;
}
