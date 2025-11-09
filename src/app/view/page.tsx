import { redirect } from 'next/navigation';

import { getViewerSession } from '@/lib/viewer-auth';
import { createCaller } from '@/server/routers/_app';

import SkillSheetViewer from './SkillSheetViewer';

export const metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ViewPage() {
  const hasSession = await getViewerSession();

  if (!hasSession) {
    redirect('/viewer-auth');
  }

  // Use tRPC caller for SSR
  const trpc = await createCaller();
  const skillSheet = await trpc.skillSheet.get();

  if (!skillSheet) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>スキルシートがまだ作成されていません。</p>
      </div>
    );
  }

  return <SkillSheetViewer skillSheet={skillSheet} />;
}
