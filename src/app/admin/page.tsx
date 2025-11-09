import { getServerSession } from 'next-auth';

import { redirect } from 'next/navigation';

import { authOptions } from '@/lib/auth';
import { createCaller } from '@/server/routers/_app';

import AdminDashboard from './AdminDashboard';

export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  // Use tRPC caller for SSR
  const trpc = await createCaller();
  const initialSkillSheet = await trpc.skillSheet.get();

  return <AdminDashboard initialSkillSheet={initialSkillSheet} />;
}
