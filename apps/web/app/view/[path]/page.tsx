import { type Metadata } from 'next';
import { unstable_cache } from 'next/cache';
import { notFound } from 'next/navigation';

import { fetchSheetFile, isValidSheetPath } from '@/server/github-sheets';

import SheetViewClient from './sheet-view-client';

interface PageProps {
  params: Promise<{ path: string }>;
}

const getCachedSheet = unstable_cache(
  async (path: string) => fetchSheetFile(path),
  ['sheet'],
  { tags: ['sheets'], revalidate: 3600 },
);

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { path } = await params;
  const decodedPath = decodeURIComponent(path);
  if (!isValidSheetPath(decodedPath)) return {};
  try {
    const sheet = await getCachedSheet(decodedPath);
    return {
      title: `${sheet.title} | エンジニアスキルシート`,
      openGraph: { title: sheet.title, type: 'profile' },
    };
  } catch {
    return {};
  }
}

export default async function SheetViewPage({ params }: PageProps) {
  const { path } = await params;
  const decodedPath = decodeURIComponent(path);
  if (!isValidSheetPath(decodedPath)) notFound();
  try {
    const sheet = await getCachedSheet(decodedPath);
    return <SheetViewClient title={sheet.title} content={sheet.content} />;
  } catch {
    notFound();
  }
}
