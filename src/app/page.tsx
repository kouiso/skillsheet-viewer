import { redirect } from 'next/navigation';

export default function Home() {
  // 閲覧者認証ページにリダイレクト
  redirect('/viewer-auth');
}
