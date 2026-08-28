import { requireViewer } from '@/server/viewer-gate';

/**
 * /view 配下（/view・/view/db・/view/[path]）の閲覧ゲート。
 * 閲覧用 HMAC cookie か Better Auth 編集者のいずれも無ければ /viewer-auth へ送る。
 * /viewer-auth・/login はこのセグメント外なのでゲート対象外。
 */
export default async function ViewLayout({ children }: { children: React.ReactNode }) {
  await requireViewer();
  return children;
}
