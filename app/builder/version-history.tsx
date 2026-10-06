'use client';

import * as AlertDialog from '@radix-ui/react-dialog';
import { useCallback, useEffect, useRef, useState } from 'react';
import SkillSheetViewer from '@/component/skill-sheet-viewer';
import type { Block } from '@/db/block';
import type { createDocumentHistory, VersionSummary } from '@/db/document-history';
import type { DocumentSnapshot } from '@/db/document-service';
import { assembleMarkdown, blockToItem } from './serialize';

type HistoryService = ReturnType<typeof createDocumentHistory>;
export type RestorePreview = Awaited<ReturnType<HistoryService['previewRestore']>>;
export type RestoreResult = Awaited<ReturnType<HistoryService['restore']>>;
export interface VersionHistoryApi {
  list: (beforeRevision?: string) => Promise<VersionSummary[]>;
  read: (revision: string) => Promise<DocumentSnapshot>;
  previewRestore: (targetRevision: string, expectedRevision: string) => Promise<RestorePreview>;
  restore: (input: {
    targetRevision: string;
    expectedRevision: string;
    confirmation: string;
  }) => Promise<RestoreResult>;
}
export interface VersionHistoryProps {
  title: string;
  currentRevision: string;
  currentEditable: boolean;
  restoreBlockedReason?: string;
  referenceMonth: number;
  api: VersionHistoryApi;
  onClose: () => void;
  onReload: () => void;
  onRestored: (result: RestoreResult) => void;
}

// 原文を変換せず各パスを比較する。配列の添字も比較対象にして順序変更を隠さない。
export function documentDifferences(
  before: unknown,
  after: unknown,
  path = '文書',
): { path: string; before: string; after: string }[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object';
  if (object(before) && object(after) && Array.isArray(before) === Array.isArray(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((key) =>
      documentDifferences(before[key], after[key], `${path}.${key}`),
    );
  }
  const text = (value: unknown) => (value === undefined ? '（項目なし）' : JSON.stringify(value, null, 2));
  return [{ path, before: text(before), after: text(after) }];
}
function fieldLabel(path: string) {
  const labels: Record<string, string> = {
    title: 'タイトル',
    blocks: 'ブロック',
    data: '内容',
    companies: '会社',
    items: '項目',
    name: '名称',
    period: '期間',
    periodStart: '開始月',
    periodEnd: '終了月',
    ongoing: '継続中',
    role: '担当',
    team: 'チーム',
    tech: '技術',
    lang: '言語',
    fw: 'フレームワーク',
    db: 'データベース',
    infra: '基盤',
    tools: 'ツール',
    collab: '共同作業',
    duties: '担当業務',
    acquired: '習得内容',
    comment: '備考',
    summary: '要約',
    hidden: '非表示',
    note: '説明',
    markdown: '本文',
    order: '順序',
    strengths: '強み',
    pr: '自己PR',
    meta: 'プロフィール項目',
    columns: '列',
    rows: '行',
    skills: 'スキル',
    category: '分類',
    label: '項目名',
    value: '値',
    unit: '単位',
    years: '経験年数',
    level: '習熟度',
    featured: '強調表示',
  };
  return path
    .split('.')
    .map((part) => (/^\d+$/.test(part) ? `${Number(part) + 1}番目` : (labels[part] ?? part)))
    .join(' › ');
}
const control =
  'min-h-11 rounded border border-input bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:border-dashed disabled:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const primary = `${control} border-primary bg-primary-dark text-primary-foreground font-semibold disabled:bg-background disabled:border-border`;
function failed(error: unknown) {
  return (
    (error !== null &&
      typeof error === 'object' &&
      'data' in error &&
      (error.data as { code?: string } | undefined)?.code === 'CONFLICT') ||
    (error instanceof Error && error.message === 'CONFLICT')
  );
}
function SnapshotPreview({ snapshot, referenceMonth }: { snapshot: DocumentSnapshot; referenceMonth: number }) {
  const valid = snapshot.validation.editable;
  const blocks = snapshot.blocks as Block[];
  return (
    <div className="min-w-0 space-y-4">
      {!valid && (
        <div role="alert" className="rounded border border-destructive p-3 text-foreground">
          この版は今の入力ルールに合わないため戻せません。原文と問題箇所を確認できます。
          <ul>
            {snapshot.validation.issues.map((issue) => (
              <li key={`${issue.blockId}-${issue.path}-${issue.code}`} className="break-words">
                {issue.path}: {issue.code}
              </li>
            ))}
          </ul>
        </div>
      )}
      {valid && (
        <SkillSheetViewer
          skillSheet={{ title: snapshot.title, content: assembleMarkdown(blocks.map(blockToItem)) }}
          blocks={blocks}
          compareMode
          referenceMonth={referenceMonth}
        />
      )}
      <details open={!valid}>
        <summary className="cursor-pointer py-3 font-semibold">全項目の原文を確認</summary>
        <pre className="whitespace-pre-wrap break-all rounded border border-border bg-muted p-3 text-xs">
          {JSON.stringify({ title: snapshot.title, blocks: snapshot.blocks }, null, 2)}
        </pre>
      </details>
    </div>
  );
}
export function VersionHistory({
  title,
  currentRevision,
  currentEditable,
  restoreBlockedReason,
  referenceMonth,
  api,
  onClose,
  onReload,
  onRestored,
}: VersionHistoryProps) {
  const apiRef = useRef(api);
  apiRef.current = api;
  const alive = useRef(true);
  const [rows, setRows] = useState<VersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [more, setMore] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pair, setPair] = useState<{ from: DocumentSnapshot; to: DocumentSnapshot } | null>(null);
  const [currentSnapshot, setCurrentSnapshot] = useState<DocumentSnapshot | null>(null);
  const [compareError, setCompareError] = useState(false);
  const [compareAttempt, setCompareAttempt] = useState(0);
  const [mobileTab, setMobileTab] = useState<'list' | 'compare'>('list');
  const [view, setView] = useState<'diff' | 'preview'>('diff');
  const [revision, setRevision] = useState(currentRevision);
  const [confirmation, setConfirmation] = useState<RestorePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [returnFocusRequested, setReturnFocusRequested] = useState(false);
  const [restoreError, setRestoreError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [undo, setUndo] = useState<{ target: string; expected: string } | null>(null);
  const [notice, setNotice] = useState(false);
  const [noticeSeconds, setNoticeSeconds] = useState(10);
  const [noticeSerial, setNoticeSerial] = useState(0);
  useEffect(() => {
    if (!returnFocusRequested || busy || confirmation || conflict) return;
    const origin = returnFocusRef.current;
    if (origin?.isConnected && !origin.matches(':disabled')) origin.focus();
    else headingRef.current?.focus();
    setReturnFocusRequested(false);
  }, [returnFocusRequested, busy, confirmation, conflict]);
  useEffect(() => {
    setRevision(currentRevision);
  }, [currentRevision]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 連続復元の成功ごとに通知時間を最初から計る。
  useEffect(() => {
    if (!notice) return;
    setNoticeSeconds(10);
    const countdown = window.setInterval(() => setNoticeSeconds((value) => Math.max(0, value - 1)), 1000);
    const timer = window.setTimeout(() => setNotice(false), 10000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(countdown);
    };
  }, [notice, noticeSerial]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const load = useCallback(async (append = false) => {
    setLoading(true);
    setListError(false);
    try {
      const next = await apiRef.current.list(append ? rowsRef.current.at(-1)?.revision : undefined);
      if (!alive.current) return;
      setRows((previous) =>
        append ? [...previous, ...next.filter((row) => !previous.some((old) => old.revision === row.revision))] : next,
      );
      setMore(next.length === 20);
      if (!append) {
        setTo(next[0]?.revision ?? '');
        setFrom(next[1]?.revision ?? next[0]?.revision ?? '');
      }
    } catch {
      if (alive.current) setListError(true);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 明示的な再試行でも同じ版を読み直す。
  useEffect(() => {
    let valid = true;
    setPair(null);
    setCompareError(false);
    if (!from || !to) return;
    Promise.all([apiRef.current.read(from), apiRef.current.read(to), apiRef.current.read(revision)])
      .then(([source, target, current]) => {
        if (valid) {
          setPair({ from: source, to: target });
          setCurrentSnapshot(current);
        }
      })
      .catch(() => {
        if (valid) setCompareError(true);
      });
    return () => {
      valid = false;
    };
  }, [from, to, revision, compareAttempt]);
  async function prepare(target = to, expected = revision) {
    if (busyRef.current || restoreBlockedReason) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    busyRef.current = true;
    setBusy(true);
    setRestoreError(false);
    try {
      const result = await apiRef.current.previewRestore(target, expected);
      if (alive.current) setConfirmation(result);
    } catch (error) {
      if (alive.current) {
        if (failed(error)) setConflict(true);
        else setRestoreError(true);
      }
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function restore() {
    if (!confirmation?.canRestore || busyRef.current || restoreBlockedReason) return;
    busyRef.current = true;
    setBusy(true);
    setRestoreError(false);
    try {
      const result = await apiRef.current.restore({
        targetRevision: confirmation.target.revision,
        expectedRevision: confirmation.current.revision,
        confirmation: confirmation.confirmation,
      });
      if (!alive.current) return;
      setRevision(result.snapshot.revision);
      setUndo(result.undoAvailable ? { target: result.undoRevision, expected: result.snapshot.revision } : null);
      setNoticeSerial((value) => value + 1);
      setNotice(true);
      setConfirmation(null);
      onRestored(result);
      await load();
    } catch (error) {
      if (alive.current) {
        if (failed(error)) {
          setConfirmation(null);
          setConflict(true);
        } else setRestoreError(true);
      }
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const differences = pair
    ? documentDifferences(
        { title: pair.from.title, blocks: pair.from.blocks },
        { title: pair.to.title, blocks: pair.to.blocks },
      )
    : [];
  const single = rows.length === 1 && !more;
  return (
    <section aria-label="版の履歴" className="min-h-screen min-w-0 bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card p-4">
        <button type="button" className={control} onClick={onClose} disabled={busy}>
          編集画面へ
        </button>
        <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold">
          版の履歴
        </h1>
        <span className="break-all text-sm text-muted-foreground">{title}</span>
      </header>
      {restoreBlockedReason && (
        <p role="alert" className="border-b border-border bg-muted p-4">
          {restoreBlockedReason}
        </p>
      )}
      {!currentEditable && (
        <p role="alert" className="border-b border-border p-4">
          いまの内容は編集できない状態です。戻したい有効な版を選んでください。
        </p>
      )}
      {notice && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 border-b border-border bg-accent p-4 text-accent-foreground"
        >
          選択した版の状態に戻しました。
          {undo && (
            <button
              type="button"
              className={control}
              disabled={busy || Boolean(restoreBlockedReason)}
              onClick={() => void prepare(undo.target, undo.expected)}
            >
              戻す前に戻す
            </button>
          )}
          <button type="button" className={control} onClick={() => setNotice(false)}>
            通知を閉じる
          </button>
          <progress className="h-1 w-full" aria-label="復元通知の残り時間" max={10} value={noticeSeconds} />
        </div>
      )}
      <nav aria-label="履歴の表示切替" className="grid grid-cols-2 border-b border-border md:hidden">
        <button
          type="button"
          className={control}
          aria-pressed={mobileTab === 'list'}
          onClick={() => setMobileTab('list')}
        >
          一覧
        </button>
        <button
          type="button"
          className={control}
          disabled={single || rows.length === 0}
          aria-pressed={mobileTab === 'compare'}
          onClick={() => setMobileTab('compare')}
        >
          比較
        </button>
      </nav>
      <div className="grid min-w-0 md:grid-cols-[280px_minmax(0,1fr)]">
        <aside
          aria-label="保存された版"
          className={`${mobileTab === 'list' ? 'block' : 'hidden'} min-w-0 border-r border-border bg-card p-4 md:block`}
        >
          {loading && (
            <p role="status" aria-busy="true" className="rounded bg-muted p-6">
              履歴を読み込み中…
            </p>
          )}
          {listError && (
            <div role="alert">
              <p>履歴を読み込めませんでした。</p>
              <button type="button" className={control} onClick={() => void load()}>
                履歴を再読み込み
              </button>
            </div>
          )}
          {!loading && !listError && rows.length === 0 && <p>保存された版がありません。</p>}
          <ol className="space-y-2">
            {rows.map((row) => (
              <li key={row.revision}>
                <button
                  type="button"
                  className={`${control} w-full text-left ${to === row.revision ? 'border-primary bg-accent text-accent-foreground' : ''}`}
                  aria-current={to === row.revision ? 'true' : undefined}
                  disabled={busy}
                  onClick={() => {
                    setFrom(revision);
                    setTo(row.revision);
                    setMobileTab('compare');
                  }}
                >
                  <span className="block font-semibold">
                    版 {row.revision}
                    {row.revision === revision ? '（現在）' : ''}
                  </span>
                  <time className="block text-xs" dateTime={row.recordedAt}>
                    {new Date(row.recordedAt).toLocaleString('ja-JP')}
                  </time>
                  <span className="block break-all text-xs">
                    {row.action === 'restore'
                      ? '復元した状態'
                      : row.action === 'create'
                        ? '作成'
                        : row.action === 'delete'
                          ? '削除前の状態'
                          : '保存'}
                  </span>
                </button>
                {row.restoredBefore !== null && (
                  <button
                    type="button"
                    className={`${control} mt-1 w-full`}
                    disabled={busy || Boolean(restoreBlockedReason)}
                    onClick={() => {
                      if (row.restoredBefore !== null) void prepare(row.restoredBefore, row.revision);
                    }}
                  >
                    版 {row.revision} の復元前（版 {row.restoredBefore}）を確認
                  </button>
                )}
              </li>
            ))}
          </ol>
          {more && (
            <button
              type="button"
              className={`${control} mt-3 w-full`}
              disabled={loading}
              onClick={() => void load(true)}
            >
              前の版を読み込む
            </button>
          )}
          {undo && (
            <button
              type="button"
              className={`${control} mt-3 w-full`}
              disabled={busy || Boolean(restoreBlockedReason)}
              onClick={() => void prepare(undo.target, undo.expected)}
            >
              復元前の版 {undo.target} を確認
            </button>
          )}
        </aside>
        <div
          className={`${mobileTab === 'compare' ? 'flex' : 'hidden'} min-h-[calc(100dvh-140px)] min-w-0 flex-col md:flex md:min-h-[calc(100dvh-80px)]`}
        >
          <div className="grid gap-3 border-b border-border bg-card p-4 sm:grid-cols-2">
            {(['from', 'to'] as const).map((side) => (
              <label key={side} className="grid min-w-0 gap-1 text-sm">
                {side === 'from' ? '比較元' : '比較先'}
                <select
                  className={`${control} min-w-0 w-full`}
                  value={side === 'from' ? from : to}
                  disabled={loading || busy || rows.length === 0 || (side === 'from' && single)}
                  onChange={(event) => (side === 'from' ? setFrom(event.target.value) : setTo(event.target.value))}
                >
                  {rows.map((row) => (
                    <option key={row.revision} value={row.revision}>
                      版 {row.revision} · {new Date(row.recordedAt).toLocaleString('ja-JP')}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="flex-1 space-y-4 p-4">
            {single && <p>版が1つしかありません。保存すると変更を比べられます。</p>}
            {compareError ? (
              <div role="alert">
                差分を読み込めませんでした。
                <button type="button" className={control} onClick={() => setCompareAttempt((x) => x + 1)}>
                  差分を再読み込み
                </button>
              </div>
            ) : !pair ? (
              <p role="status" aria-busy="true">
                差分を読み込み中…
              </p>
            ) : (
              <>
                <nav aria-label="版の内容表示" className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={control}
                    aria-pressed={view === 'diff'}
                    onClick={() => setView('diff')}
                  >
                    差分
                  </button>
                  <button
                    type="button"
                    className={control}
                    aria-pressed={view === 'preview'}
                    onClick={() => setView('preview')}
                  >
                    選択した版の全体プレビュー
                  </button>
                </nav>
                {!pair.to.validation.editable && (
                  <p role="alert">
                    この版は今の入力ルールに合わないため戻せません。全体プレビューで原文と問題箇所を確認できます。
                  </p>
                )}
                {view === 'preview' ? (
                  <SnapshotPreview snapshot={pair.to} referenceMonth={referenceMonth} />
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      差分 {differences.length}項目 · 削除は取り消し線、追加は下線
                    </p>
                    {differences.length === 0 && <p>内容は同じです。</p>}
                    {differences.map((d) => (
                      <section key={d.path} className="min-w-0 rounded border border-border bg-card p-3">
                        <h2 className="mb-3 break-all text-sm font-semibold">{fieldLabel(d.path)}</h2>
                        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
                          <div className="min-w-0">
                            <h3 className="text-xs text-muted-foreground">比較元 · 削除</h3>
                            <del className="block whitespace-pre-wrap break-all text-sm">{d.before}</del>
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-xs text-muted-foreground">比較先 · 追加</h3>
                            <ins className="block whitespace-pre-wrap break-all text-sm">{d.after}</ins>
                          </div>
                        </div>
                      </section>
                    ))}
                  </>
                )}
              </>
            )}
            {restoreError && !confirmation && (
              <p role="alert">復元の確認を取得できませんでした。内容は変更していません。もう一度お試しください。</p>
            )}
          </div>
          <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card p-4">
            <span className="text-sm text-muted-foreground">いまの内容も履歴に残ります。</span>
            <button
              type="button"
              className={primary}
              disabled={
                busy ||
                Boolean(restoreBlockedReason) ||
                !pair ||
                !pair.to.validation.editable ||
                to === revision ||
                !currentSnapshot ||
                JSON.stringify({ title: currentSnapshot.title, blocks: currentSnapshot.blocks }) ===
                  JSON.stringify({ title: pair.to.title, blocks: pair.to.blocks }) ||
                conflict
              }
              onClick={() => void prepare()}
            >
              {busy ? '処理中…' : 'この版に戻す'}
            </button>
          </footer>
        </div>
      </div>
      <AlertDialog.Root
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmation(null);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <AlertDialog.Content
            role="alertdialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              setReturnFocusRequested(true);
            }}
            onInteractOutside={(event) => event.preventDefault()}
            onOpenAutoFocus={(event) => {
              if (cancelRef.current) {
                event.preventDefault();
                cancelRef.current.focus();
              }
            }}
            className="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[min(560px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded border border-border bg-card p-5 text-foreground shadow-xl"
          >
            <AlertDialog.Title className="text-lg font-semibold">
              版 {confirmation?.target.revision} の状態に戻します。
            </AlertDialog.Title>
            <AlertDialog.Description className="my-3 text-sm">
              {confirmation?.current.validation.editable
                ? 'いまの内容も履歴に残るので、あとから戻せます。'
                : '復元前の内容は履歴に残りますが、現在の入力ルールでは戻せません。'}
            </AlertDialog.Description>
            {confirmation && confirmation.laterRevisionCount !== '0' && (
              <p className="mb-3 rounded border border-border bg-muted p-3 text-sm">
                この版のあとに {confirmation.laterRevisionCount}
                件の記録があります。それらの変更も今の内容から消えます（履歴には残ります）。
              </p>
            )}
            {confirmation?.visibilityUncertain && (
              <p role="alert" className="mb-3 font-semibold">
                現在の内容が編集不能のため、公開範囲の差を完全には確認できません。選択した版の全内容を確認してください。
              </p>
            )}
            {Boolean(confirmation?.newlyVisible.length) && (
              <div className="mb-3">
                <h2 className="font-semibold">次の内容が閲覧者の画面に表示されるようになります</h2>
                <ul className="mt-2 list-disc space-y-2 pl-5">
                  {confirmation?.newlyVisible.map((item, i) => (
                    <li key={`${item.blockId}-${item.companyId}-${item.projectId ?? i}`} className="break-words">
                      {item.company}
                      {item.project !== undefined && <> / {item.project}</>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {confirmation && !confirmation.canRestore && (
              <p role="alert">
                {confirmation.sameContent
                  ? 'いまの内容と同じため戻す必要はありません。'
                  : 'この版は今の入力ルールに合わないため戻せません。'}
              </p>
            )}
            {restoreError && (
              <p role="alert" className="my-3">
                復元の完了を確認できませんでした。再試行するか、やめるを選んでください。
              </p>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <AlertDialog.Close asChild>
                <button ref={cancelRef} type="button" className={control} disabled={busy}>
                  やめる
                </button>
              </AlertDialog.Close>
              <button
                type="button"
                className={primary}
                disabled={busy || Boolean(restoreBlockedReason) || !confirmation?.canRestore}
                onClick={() => void restore()}
              >
                {busy ? '復元中…' : restoreError ? '再試行' : '戻す'}
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <AlertDialog.Root open={conflict}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <AlertDialog.Content
            role="alertdialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              setReturnFocusRequested(true);
            }}
            onInteractOutside={(event) => event.preventDefault()}
            onOpenAutoFocus={(event) => {
              if (cancelRef.current) {
                event.preventDefault();
                cancelRef.current.focus();
              }
            }}
            className="fixed left-1/2 top-1/2 z-50 w-[min(520px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded border border-border bg-card p-5 text-foreground"
          >
            <AlertDialog.Title className="text-lg font-semibold">
              ほかの画面かツールで更新されました。
            </AlertDialog.Title>
            <AlertDialog.Description className="my-4">
              最新の履歴を読み込んでから、もう一度選んでください。
            </AlertDialog.Description>
            <AlertDialog.Close asChild>
              <button
                type="button"
                className={primary}
                onClick={() => {
                  setConflict(false);
                  setConfirmation(null);
                  onReload();
                }}
              >
                最新を読み込む
              </button>
            </AlertDialog.Close>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  );
}
