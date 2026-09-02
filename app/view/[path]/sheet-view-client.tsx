'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import Header from '@/components/header';
import SkillSheetViewer from '@/components/skill-sheet-viewer';
import { ALL_VIEW_KEYS, ViewerTopbar, type ViewKey } from '@/components/viewer-topbar';
import type { Block } from '@/db/blocks';
import { useReadDepth } from '@/hooks/use-read-depth';
import { captureError, track } from '@/lib/observability/capture';
import type { SheetSource } from '@/lib/observability/event';

interface SheetViewClientProps {
  title: string;
  content: string;
  blocks?: Block[];
  /** シートの取得元。計測イベントの source プロパティにそのまま乗る。 */
  source: SheetSource;
  /** 編集者ログイン済みか。false（閲覧コードのみ等）のときは編集導線を出さない。 */
  canEdit?: boolean;
  /** 編集者判定の前後で編集ボタン分の幅を固定し、レイアウトずれを防ぐ。 */
  reserveEditSlot?: boolean;
  /**
   * true のとき、DB への再接続に失敗して古いキャッシュを表示している可能性があることを
   * 画面上部に案内する（Issue #204）。sheets-cache.ts の isDbContentStale() で判定する。
   */
  stale?: boolean;
  /** SSRとHydrationで共有する、継続中案件の集計基準月。 */
  referenceMonth?: number;
}

const PDF_DURATION_BUCKETS = [
  { max: 5_000, label: '0-5' },
  { max: 15_000, label: '5-15' },
  { max: 30_000, label: '15-30' },
  { max: 60_000, label: '30-60' },
] as const;

function durationBucket(ms: number): (typeof PDF_DURATION_BUCKETS)[number]['label'] | '60+' {
  const found = PDF_DURATION_BUCKETS.find((b) => ms < b.max);
  return found?.label ?? '60+';
}

function pdfFailureReason(err: unknown): 'TypeError' | 'RangeError' | 'FetchError' | 'Error' | 'unknown' {
  if (err instanceof TypeError) return 'TypeError';
  if (err instanceof RangeError) return 'RangeError';
  // ブラウザの fetch 失敗（オフライン等）は環境依存の名前になりがちなので name で判定する
  // （err.message はフォント URL 等を含みうるので使わない）。
  if (err instanceof Error && err.name === 'FetchError') return 'FetchError';
  if (err instanceof Error) return 'Error';
  return 'unknown';
}

const REVOKE_OBJECT_URL_DELAY_MS = 100;

const SheetViewClient = ({
  title,
  content,
  blocks,
  source,
  canEdit = false,
  reserveEditSlot = false,
  stale = false,
  referenceMonth,
}: SheetViewClientProps) => {
  const [pdfLoading, setPdfLoading] = useState(false);
  // project ブロックを含むシートはダッシュボード扱いにし、Console トップバー＋ビュートグルを出す。
  // 意図的に raw blocks（中身が空でも）で判定する — skill-sheet-viewer.tsx の isDashboard と
  // 必ず揃えること（片方だけ直すとヘッダー/レイアウトがページ間で食い違う）。
  const isDashboard = useMemo(() => (blocks ?? []).some((b) => b.type === 'project'), [blocks]);
  // ビュー表示のON/OFF状態。初期値は全ビューON（トグルはダッシュボードのみ）。
  const [views, setViews] = useState<ViewKey[]>(() => [...ALL_VIEW_KEYS]);
  // トップバーに出す氏名・会社名はプロフィールブロックから引く。
  const profile = useMemo(
    () => (blocks ?? []).find((b): b is Extract<Block, { type: 'profile' }> => b.type === 'profile'),
    [blocks],
  );
  const blockCount = blocks?.length ?? 0;

  // 親が key={path}/key={id} でシートごとに再マウントする設計（トグル state を
  // 次のシートへ持ち越さないため）なので、このコンポーネントの mount は
  // 「1シートを開いた」に一致する。ここが初の useEffect になるので依存配列を
  // 貼り付けず個別に検討した — isDashboard/source/blockCount は再マウントでしか変わらない。
  // biome-ignore lint/correctness/useExhaustiveDependencies: マウント1回だけで送る（下のコメント参照）。
  useEffect(() => {
    track({
      name: 'sheet_viewed',
      layout: isDashboard ? 'dashboard' : 'markdown',
      source,
      blockCount,
    });
  }, []);

  useReadDepth();

  const toggleView = (view: ViewKey) => {
    // setState の updater 内で副作用（track）を呼ばない — StrictMode 下では updater が
    // 2回呼ばれうるため、外側で現在値から次の状態を決めてから1回だけ送る。
    const enabled = !views.includes(view);
    track({ name: 'sheet_view_toggled', view, enabled });
    setViews((prev) => (enabled ? [...prev, view] : prev.filter((v) => v !== view)));
  };

  const handleDownloadPdf = async () => {
    const toastId = toast.loading('PDFを生成中…');
    const startedAt = performance.now();
    // 生成に失敗したときの後始末。import が済んだ時点で掴んでおく — catch の中で
    // 改めて動的 import すると、その await の分だけ finally が遅れてボタンが busy のまま残る。
    let resetFontsOnFailure: (() => void) | undefined;
    try {
      setPdfLoading(true);

      const [{ pdf }, { SkillSheetPDF, resetPdfFontsAfterFailure }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/components/pdf-export'),
      ]);
      resetFontsOnFailure = resetPdfFontsAfterFailure;

      // blocks を渡すと印刷デザイン（会社セクション + 案件カード）で描かれる。
      // views は「押した瞬間のトグルの状態」で、永続化はしていない（DB に項目を足さない方針）。
      const blob = await pdf(
        <SkillSheetPDF title={title} content={content} blocks={blocks} views={views} referenceMonth={referenceMonth} />,
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, REVOKE_OBJECT_URL_DELAY_MS);

      toast.success('PDFをダウンロードしました', { id: toastId });
      track({ name: 'pdf_exported', result: 'success', durationBucket: durationBucket(performance.now() - startedAt) });
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast.error('PDFの生成に失敗しました', { id: toastId });
      track({
        name: 'pdf_exported',
        result: 'failure',
        durationBucket: durationBucket(performance.now() - startedAt),
        reason: pdfFailureReason(err),
      });
      captureError(err, { feature: 'pdf-export' });
      // フォント取得の失敗（オフライン・5xx 等）は @react-pdf/font 内で reject 済みの
      // Promise として永久にキャッシュされ、次のクリックも即座に同じ失敗を再現する
      // （リロードしないと直らない「詰み」状態になる）。失敗のたびに登録をリセットし、
      // 次のクリックで新しい FontSource から取得し直させる（フォント取得以外の失敗
      // でも安全 — 単に次回また登録し直すだけで副作用は無い）。
      resetFontsOnFailure?.();
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div>
      {stale && (
        <div
          role="status"
          className="border-b border-warn/40 bg-warn-soft px-4 py-2 text-center text-sm text-warn-strong"
        >
          表示中の内容はしばらく更新されていない可能性があります。最新の状態と異なる場合があります。
        </div>
      )}
      {isDashboard ? (
        <ViewerTopbar
          name={profile?.data.name}
          company={profile?.data.company}
          views={views}
          onToggleView={toggleView}
          onDownloadPdf={handleDownloadPdf}
          pdfLoading={pdfLoading}
          canEdit={canEdit}
          reserveEditSlot={reserveEditSlot}
        />
      ) : (
        <Header
          onDownloadPdf={handleDownloadPdf}
          pdfLoading={pdfLoading}
          canEdit={canEdit}
          reserveEditSlot={reserveEditSlot}
          backHref="/view"
        />
      )}
      <SkillSheetViewer
        skillSheet={{ title, content }}
        blocks={blocks}
        views={isDashboard ? views : undefined}
        referenceMonth={referenceMonth}
      />
    </div>
  );
};

export default SheetViewClient;
