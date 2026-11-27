'use client';

import * as AlertDialog from '@radix-ui/react-dialog';
import { ChevronLeft, Info, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import SkillSheetViewer from '@/component/skill-sheet-viewer';
import type { Block } from '@/db/block';
import type { createDocumentHistory, VersionSummary } from '@/db/document-history';
import type { DocumentSnapshot } from '@/db/document-service';
import { assembleMarkdown, blockToItem } from './serialize';
import { documentDifferences } from './version-diff';
import { DiffFrames } from './version-diff-view';
import { groupVersions } from './version-group';

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

// 板の行の見出し（.t）は「10月27日 10:11」。月日は「10月27日」、時刻は2桁の時:分で出す。
function groupStart(recordedAt: string) {
  return new Date(recordedAt).toLocaleString('ja-JP', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
// まとまりは時刻の幅が最長10分未満だが、日付をまたぐことはあるので、そのときだけ終わりにも日付を出す。
// 同じ分のうちに収まったときは「07:06〜07:06」と並べず、終わりを出さない（null）。
function groupEnd(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const time = (date: Date) => date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  if (start.toDateString() !== end.toDateString()) return groupStart(endAt);
  return time(start) === time(end) ? null : time(end);
}
// まとまりの時刻の範囲。recordedAt は DB の now() で、並行した保存では版番号の順と逆になりうるため、
// 位置（最古・最新の版）ではなく時刻の最小・最大で取る。groupVersions が作るまとまりは、
// 全員が読める時刻を持つ（読めない版は単独の行になる）。
function groupSpan(versions: readonly VersionSummary[]) {
  const time = (version: VersionSummary) => Date.parse(version.recordedAt);
  const first = versions.reduce((a, b) => (time(b) < time(a) ? b : a));
  const last = versions.reduce((a, b) => (time(b) > time(a) ? b : a));
  return { first: first.recordedAt, last: last.recordedAt };
}
// 板のボタンは .btn2（高さ 40px）。この画面のボタン・選択欄はこれに揃える（#674）。
// 共有部品の 44px とは変え方が別になるため、この画面だけの寸法として持つ。
const control =
  'min-h-10 rounded border border-input bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:border-dashed disabled:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
/* ダイアログのボタンは板どおり 高さ 36px（390px では 44px・幅いっぱい）。use-workspace-confirm と同じ寸法 */
const dialogButton =
  'h-9 rounded-[4px] border px-3 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:border-dashed disabled:text-muted-foreground max-sm:h-11 max-sm:w-full';
const dialogPrimary = `${dialogButton} border-primary-dark bg-primary-dark text-primary-foreground disabled:bg-background disabled:border-border`;
const dialogNormal = `${dialogButton} border-input bg-background text-foreground`;
// 板「戻した後・空・失敗」の一覧側の箱: 地 card・枠線 1px・角丸 6px・余白 20px・中の間隔 12px。
const listBox = 'space-y-3 rounded-lg border border-border bg-card p-5';
// 反転色のトーストの中のボタン（.toast button: 高さ 32px・枠 1px・600 13px）。
const toastButton =
  'h-8 shrink-0 rounded border border-background bg-transparent px-3 text-[13px] font-semibold text-background disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const primary = `${control} border-primary bg-primary-dark text-primary-foreground font-semibold disabled:bg-background disabled:border-border`;
// 板「版の履歴と2版の比較」の一覧の行（.ver）: 横並び・上揃え・間 10px・余白 10px 16px・下に区切り線。
// 比較元に選んだ行（.sel）は地を acc にする。
const verLayout = 'flex min-w-0 items-start gap-2.5 px-4 py-2.5';
const verRow = `${verLayout} border-b border-border`;
const verSelected = 'bg-accent';
// 板の .tag: 高さ 20px・左右 6px・角丸 3px・11px/600。地 chip・文字 mfg。現在（.tag.a）は acc/accfg、
// 復元（.tag.w）は warns/warn。warn はアプリの warn-soft / warn-strong（#671 で板に寄せた値）を使う。
// 文字は板の 11px でなく 12px。画面の文字は 12px 以上という決まり（src/test/min-font-size.test.ts）を優先する。
const tag = 'inline-flex h-5 items-center rounded-[3px] px-1.5 text-xs font-semibold';
const tagChip = `${tag} bg-chip-bg text-chip-text`;
const tagCurrent = `${tag} bg-accent text-accent-foreground`;
const tagRestore = `${tag} bg-warn-soft text-warn-strong`;
// 比較元に選んだ行は地が acc なので、同じ acc の「現在」タグは地に溶けて見えなくなる。
// 選んだ行の中のタグには 1px の枠を足し、「現在」は地を card にして読めるようにする。
const tagCurrentOnSelected = `${tag} border border-accent-text bg-card text-accent-foreground`;
const tagOnSelected = 'border border-border';
// 板の .pk: 高さ 28px・左右 8px・角丸 4px・枠 bd・地なし・文字 mfg・11px/500。
// 比較元（.pk.from）は del 系、比較先（.pk.to）は add 系。差分の色（version-diff-view）と同じアプリの色を使う。
// 文字は .tag と同じ理由で 12px。
const pick =
  'h-7 shrink-0 rounded-[4px] border px-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:border-dashed';
const pickIdle = `${pick} border-border bg-transparent text-muted-foreground`;
const pickFrom = `${pick} border-danger bg-danger-soft text-danger`;
const pickTo = `${pick} border-accent-text bg-accent-soft text-accent-text`;
// 390 の帯のボタンは板どおり枠なしの記号（× / ‹）だけにする。sm 以上は文字のボタンのまま。
// display はここで決めない。隠す側の hidden と同じ段で競合すると、隠したはずのボタンが出るため。
// 板の帯の記号ボタンは 32px（.btn3）・記号 18px。見た目は板のまま、::before を 6px ずつ外へ出して
// タップ領域は 44px 四方にする（e2e/builder-ux-fix.spec.ts と同じ負の inset の手法）。
// ::before は max-sm: と重ねない（max-sm:before: は jsdom の CSS 走査が再帰で溢れ、globals.css を読む試験が落ちる）。
// sm 以上の文字ボタンでも、周りに 6px 広がるだけで見た目は変わらない。
const headerIconOnMobile =
  "relative max-sm:h-8 max-sm:min-h-0 max-sm:w-8 max-sm:items-center max-sm:justify-center max-sm:border-0 max-sm:bg-transparent max-sm:p-0 before:absolute before:-inset-1.5 before:content-['']";
function actionText(action: VersionSummary['action']) {
  return action === 'restore'
    ? '復元した状態'
    : action === 'create'
      ? '作成'
      : action === 'delete'
        ? '削除前の状態'
        : '保存';
}
function clock(recordedAt: string) {
  return new Date(recordedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}
// 同じ分に収まる版（自動保存の内訳）を見分けられるよう、内訳の行だけ秒まで出す。
function clockWithSeconds(recordedAt: string) {
  return new Date(recordedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function stampWithSeconds(recordedAt: string) {
  return new Date(recordedAt).toLocaleString('ja-JP', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
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
      <div>
        <p className="text-xs text-muted-foreground">シートタイトル</p>
        <h3 className="break-words text-base font-semibold">{snapshot.title}</h3>
      </div>
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
  // 比較元を利用者が自分で選んだか。選ぶまでは、比較先を押すだけで比較元を「いまの内容」に合わせる。
  const [fromChosen, setFromChosen] = useState(false);
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
  const barTitleRef = useRef<HTMLHeadingElement>(null);
  // 390px の画面切替で hidden 側にフォーカスが残るとキーボード操作が見失われるので、
  // 遷移先の操作へ移し替える。初期表示では動かさないよう、切替操作の時だけ立てる。
  const mobileFocusRef = useRef(false);
  const showCompareRef = useRef<HTMLButtonElement>(null);
  const backToListRef = useRef<HTMLButtonElement>(null);
  const [returnFocusRequested, setReturnFocusRequested] = useState(false);
  const [restoreError, setRestoreError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [undo, setUndo] = useState<{ target: string; expected: string } | null>(null);
  const [confirmationReviewOpen, setConfirmationReviewOpen] = useState(false);
  // 開いている確認が「取り消し」（戻す前の版へ戻す）か。板の状態2の文と題はこの時だけ使う。
  const [undoConfirmation, setUndoConfirmation] = useState(false);
  // 復元の確認の取得に失敗した時の「再試行」で、同じ引数でやり直す。
  const lastPrepare = useRef<{ target: string; expected: string; reviewTarget: boolean } | null>(null);
  const [notice, setNotice] = useState(false);
  // 戻した版の日時（板の通知「10月26日 18:40 の版に戻しました」）。一覧に無い版なら null。
  const [noticeStamp, setNoticeStamp] = useState<string | null>(null);
  const [noticeSeconds, setNoticeSeconds] = useState(10);
  const [noticeSerial, setNoticeSerial] = useState(0);
  // 開いているまとまりを、その中で最も新しい版で覚える（古い保存を読み込んでも変わらない）。
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const single = rows.length === 1 && !more;
  useEffect(() => {
    if (!returnFocusRequested || busy || confirmation || conflict) return;
    const origin = returnFocusRef.current;
    if (origin?.isConnected && !origin.matches(':disabled')) origin.focus();
    else {
      // 戻り先の操作が無効になっていた時は見出しへ。390 の比較画面では「版の履歴」の h1 が隠れているので、
      // 帯に出している比較の見出しへ移す（隠れた要素への focus() は何も起こさず、フォーカスが失われる）。
      const bar = barTitleRef.current;
      (bar && bar.getClientRects().length > 0 ? bar : headingRef.current)?.focus();
    }
    setReturnFocusRequested(false);
  }, [returnFocusRequested, busy, confirmation, conflict]);
  useEffect(() => {
    if (!mobileFocusRef.current) return;
    mobileFocusRef.current = false;
    (mobileTab === 'compare' ? backToListRef : showCompareRef).current?.focus();
  }, [mobileTab]);
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
        setFromChosen(false);
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
  // 選んだ版がまとまりの内側（最新でない版）なら、そのまとまりを開く。閉じたままだと、選んだ行が見えず、
  // まとまりの行のボタンも押下状態にならない（押下状態は最新の版を選んだ時だけ）。読み込み直後の既定の比較元や
  // 選び直した時に働く。利用者が自分で閉じた後は、選択が変わるまで開き直さない。
  useEffect(() => {
    const inner = new Set<string>();
    for (const row of groupVersions(rowsRef.current)) {
      if (row.kind !== 'group') continue;
      const [newest, ...rest] = row.versions;
      if (rest.some((version) => version.revision === from || version.revision === to)) inner.add(newest.revision);
    }
    if (inner.size === 0) return;
    setExpanded((previous) => {
      if ([...inner].every((key) => previous.has(key))) return previous;
      return new Set([...previous, ...inner]);
    });
  }, [from, to]);
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
  // 「この版に戻す」で戻す版。2版のうち「いまの内容」でない方（比較先を優先）。
  // 板の既定は 比較元 = 古い版・比較先 = 現在 なので、比較先が現在なら比較元の古い版を戻す。
  // 戻す版が1つに決まらない時（両方が現在）は null で、押せない。同じ版を2つ選んでいる時は決まっても押せない。
  const restoreTarget = to !== revision ? to : from !== revision ? from : null;
  const sameVersion = from !== '' && from === to;
  async function prepare(target = restoreTarget ?? '', expected = revision, reviewTarget = false) {
    if (!target || busyRef.current || restoreBlockedReason) return;
    lastPrepare.current = { target, expected, reviewTarget };
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    busyRef.current = true;
    setBusy(true);
    setRestoreError(false);
    try {
      const result = await apiRef.current.previewRestore(target, expected);
      if (alive.current) {
        setConfirmationReviewOpen(reviewTarget);
        setUndoConfirmation(reviewTarget);
        setConfirmation(result);
      }
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
      const restoredAt = rowsRef.current.find((row) => row.revision === confirmation.target.revision)?.recordedAt;
      setNoticeStamp(restoredAt ? groupStart(restoredAt) : null);
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
  // 比較先を押した時、比較元をまだ自分で選んでいなければ「いまの内容」に合わせる
  // （1回の操作で「この古い版 と いま」の差分になる）。現在の版そのものを比較先にした時は、
  // 同じ版どうしにならないよう既定の比較元（一覧の2番目）へ戻す。
  function chooseTo(target: string) {
    setTo(target);
    if (fromChosen) return;
    setFrom(target === revision ? (rows[1]?.revision ?? rows[0]?.revision ?? target) : revision);
  }
  function chooseFrom(target: string) {
    setFrom(target);
    setFromChosen(true);
  }
  // 板では行そのものは押せず、右の「比較元」「比較先」で2つの版を選ぶ。
  // 板は古い行に「比較元」しか置かないが、任意の2版を比べられるよう、どの行にも両方を置く（意図した差分）。
  // 版が1つしかない時は比べる相手が無いので、ボタンごと出さない（板「版が1つしかありません」）。
  function pickButtons(target: string, name: string, pressedFrom: boolean, pressedTo: boolean) {
    if (single) return null;
    return (
      <div className="flex shrink-0 gap-1.5">
        <button
          type="button"
          className={pressedFrom ? pickFrom : pickIdle}
          aria-pressed={pressedFrom}
          aria-label={`比較元（${name}）`}
          disabled={busy}
          onClick={() => chooseFrom(target)}
        >
          比較元
        </button>
        <button
          type="button"
          className={pressedTo ? pickTo : pickIdle}
          aria-pressed={pressedTo}
          aria-label={`比較先（${name}）`}
          disabled={busy}
          onClick={() => chooseTo(target)}
        >
          比較先
        </button>
      </div>
    );
  }
  function restoredBeforeButton(row: VersionSummary, className = 'mx-4 mb-2.5 w-[calc(100%-2rem)]') {
    if (row.restoredBefore === null) return null;
    return (
      <button
        type="button"
        className={`${control} ${className}`}
        disabled={busy || Boolean(restoreBlockedReason)}
        onClick={() => {
          if (row.restoredBefore !== null) void prepare(row.restoredBefore, row.revision, true);
        }}
      >
        版 {row.revision} の復元前（版 {row.restoredBefore}）を確認
      </button>
    );
  }
  // 行の説明（板の .s）。版番号は同じ時刻の行を見分けるため、すべての行に出す。
  // 復元の行は、板「10月20日の版に戻した」のとおり戻した先の日時を出す。戻した先が一覧に無い（まだ読んでいない
  // 古い版）時は日時が分からないので、版番号で示す。
  function rowSubtitle(row: VersionSummary) {
    if (row.action !== 'restore') return `${actionText(row.action)} · 版 ${row.revision}`;
    if (row.restoredFrom === null) return `${actionText(row.action)} · 版 ${row.revision}`;
    const source = rows.find((candidate) => candidate.revision === row.restoredFrom);
    const where = source ? `${groupStart(source.recordedAt)} の版に戻した` : `版 ${row.restoredFrom} に戻した`;
    return `${where} · 版 ${row.revision}`;
  }
  // compact は板「版が1つしかありません」の箱の中の行: 区切り線・選択の地・比較のボタンを持たない。
  function versionEntry(row: VersionSummary, compact = false) {
    const selected = !compact && from === row.revision;
    return (
      // 「復元前を確認」は文字が長く、見出しの欄（右にボタン2つ）に入れると途中で折り返すので、
      // 行の下に幅いっぱいで置く。区切り線と選択の地は外側にまとめて付ける。
      <div className={compact ? '' : `border-b border-border ${selected ? verSelected : ''}`}>
        <div className={compact ? 'flex min-w-0 items-start gap-2.5 py-2' : verLayout}>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-semibold">
              <time dateTime={row.recordedAt}>{groupStart(row.recordedAt)}</time>
              {row.revision === revision && <span className={selected ? tagCurrentOnSelected : tagCurrent}>現在</span>}
              {row.action === 'restore' && (
                <span className={`${tagRestore} ${selected ? tagOnSelected : ''}`}>復元</span>
              )}
            </p>
            <p className="break-all text-xs text-muted-foreground">{rowSubtitle(row)}</p>
          </div>
          {!compact && pickButtons(row.revision, `版 ${row.revision}`, from === row.revision, to === row.revision)}
        </div>
        {restoredBeforeButton(row, compact ? 'mt-1 w-full' : undefined)}
      </div>
    );
  }
  // まとまりの内訳の行（板では左 32px 下げ・区切り線なし・時刻だけを等幅で出す）。
  // 同じ分に収まる保存を見分けられるよう、秒と版番号も出す（「14:08:05 · 版 2」）。
  // 日付をまたいだまとまりでは、始まりと違う日の版にだけ日付も出す。
  function childEntry(row: VersionSummary, groupFirst: string) {
    const sameDay = new Date(row.recordedAt).toDateString() === new Date(groupFirst).toDateString();
    return (
      <div className={`flex min-w-0 items-start gap-2.5 py-2.5 ${from === row.revision ? verSelected : ''}`}>
        <p className="min-w-0 flex-1 font-mono text-xs text-muted-foreground">
          <time dateTime={row.recordedAt}>
            {sameDay ? clockWithSeconds(row.recordedAt) : stampWithSeconds(row.recordedAt)}
          </time>
          {` · 版 ${row.revision}`}
        </p>
        {pickButtons(row.revision, `版 ${row.revision}`, from === row.revision, to === row.revision)}
      </div>
    );
  }
  // 確認で示す「あとの編集」の件数。DB の件数（laterRevisionCount）は「戻す版より後の版」の数で、
  // 取り消しの確認では、戻した復元そのもの（1件）を含む。取り消しでは、それを除いた数が板の「戻したあとの編集」。
  // 件数は版番号の差でなく文字列の数（巨大な版番号でも丸めない）で扱う。
  const laterCount = confirmation ? BigInt(confirmation.laterRevisionCount) : 0n;
  const laterEdits = undoConfirmation ? (laterCount > 0n ? laterCount - 1n : 0n) : laterCount;
  const undoWithEdits = undoConfirmation && laterEdits > 0n;
  // 版が1つの時は、一覧側の箱の中に版を出す（下の ol は空にする）。
  const listRows = single ? [] : groupVersions(rows);
  const differences = pair
    ? documentDifferences(
        { title: pair.from.title, blocks: pair.from.blocks },
        { title: pair.to.title, blocks: pair.to.blocks },
      )
    : [];
  const clockOf = (rev: string) => {
    const row = rows.find((r) => r.revision === rev);
    return row ? clock(row.recordedAt) : '';
  };
  // 凡例は、同じ分の版を見分けられるよう「版 N 14:08」と版番号も付ける。
  const timeOf = (rev: string) => (rev ? `版 ${rev} ${clockOf(rev)}`.trimEnd() : '');
  // 戻す版（restoreTarget）の中身。比較先が現在なら比較元側、それ以外は比較先側。
  const targetSnapshot = pair ? (restoreTarget === from && restoreTarget !== to ? pair.from : pair.to) : null;
  // 戻す版との差分が「いまの内容から」になるのは、どちらかが現在の時だけ。
  // 現在を含まない2版を選んでいる時は、見出しも「比較元から比較先で」と正直に出す。
  const compareHeading =
    from === revision || to === revision ? 'いまの内容から変わる項目' : '比較元から比較先で変わる項目';
  return (
    <section aria-label="版の履歴" className="min-h-screen min-w-0 bg-background text-foreground">
      {/* 板（390）: 上の帯は高さ 56px。比較画面では戻り先が一覧になる別画面なので、
          390 では帯の左を「一覧へ」に切り替える（編集画面へは一覧画面から行く）。
          板（390）の帯は左右 8px・左に記号のボタン（一覧は ×、比較は ‹）・見出し 16px。
          記号だけでは名前が無いので aria-label を付ける。文字は sm 以上で出し、1つのボタンで出し分ける。 */}
      <header className="flex items-center gap-3 border-b border-border bg-card p-4 max-sm:h-14 max-sm:px-2 max-sm:py-0">
        <button
          type="button"
          aria-label="編集画面へ"
          className={`${control} ${headerIconOnMobile} ${mobileTab === 'compare' ? 'max-sm:hidden' : 'max-sm:inline-flex'}`}
          onClick={onClose}
          disabled={busy}
        >
          <X aria-hidden="true" className="h-[18px] w-[18px] sm:hidden" />
          <span className="max-sm:hidden">編集画面へ</span>
        </button>
        <button
          type="button"
          ref={backToListRef}
          aria-label="一覧へ"
          className={`${control} ${headerIconOnMobile} ${mobileTab === 'compare' ? 'inline-flex md:hidden' : 'hidden'}`}
          onClick={() => {
            mobileFocusRef.current = true;
            setMobileTab('list');
          }}
        >
          <ChevronLeft aria-hidden="true" className="h-[18px] w-[18px] sm:hidden" />
          <span className="max-sm:hidden">一覧へ</span>
        </button>
        {/* 板（390）: 比較画面の帯の題は「いまの内容から変わる項目」。一覧画面は「版の履歴」。
            390 の比較画面では版の履歴の題とシート名を隠し、比較の題を帯に出す（ペイン側の見出しは重複するので隠す）。 */}
        <h1
          ref={headingRef}
          tabIndex={-1}
          className={`shrink-0 text-xl font-semibold max-sm:text-base ${mobileTab === 'compare' ? 'max-sm:hidden' : ''}`}
        >
          版の履歴
        </h1>
        <span
          className={`min-w-0 break-all text-sm text-muted-foreground max-sm:truncate ${mobileTab === 'compare' ? 'max-sm:hidden' : ''}`}
        >
          {title}
        </span>
        {mobileTab === 'compare' && (
          // 390 の比較画面で見える唯一の見出し（上の h1 とペイン側の h2 は 390 では隠れる）。
          <h1 ref={barTitleRef} tabIndex={-1} className="min-w-0 flex-1 truncate text-base font-semibold sm:hidden">
            {compareHeading}
          </h1>
        )}
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
        // 板「戻した直後（取り消しの通知）」: 箱（card・枠 1px・角丸 6px・余白 20px・間隔 12px）の中に、
        // 反転色のトースト（地 fg・文字 bg・角丸 6px・余白 12/14・13px）、4px の残り時間のバー、説明の一文。
        // 画面いっぱいの帯にして、箱の枠と余白は帯の中に収める。
        <div className="border-b border-border bg-card p-4">
          <div className={`${listBox} mx-auto max-w-[760px]`}>
            <div
              role="status"
              className="flex items-center gap-3 rounded-lg bg-foreground px-3.5 py-3 text-[13px] text-background"
            >
              {/* 板: 「10月26日 18:40 の版に戻しました。いまの内容も履歴に残っています。」 */}
              <span className="min-w-0 flex-1 break-words">
                {noticeStamp ? `${noticeStamp} の版に戻しました。` : '選択した版の状態に戻しました。'}
                いまの内容も履歴に残っています。
              </span>
              {undo && (
                <button
                  type="button"
                  className={toastButton}
                  disabled={busy || Boolean(restoreBlockedReason)}
                  onClick={() => void prepare(undo.target, undo.expected, true)}
                >
                  取り消す
                </button>
              )}
              {/* 板に無い閉じる操作は、トーストに合う記号ボタンで残す。当たり判定は ::before で 44px */}
              <button
                type="button"
                aria-label="通知を閉じる"
                className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded text-background before:absolute before:-inset-1.5 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                onClick={() => setNotice(false)}
              >
                <X aria-hidden="true" className="h-[18px] w-[18px]" />
              </button>
            </div>
            {/* 板: 高さ 4px・角丸 2px・地 chip、塗りは pri。残り時間は 10 秒で 100% → 0% */}
            <div
              role="progressbar"
              aria-label="復元通知の残り時間"
              aria-valuemin={0}
              aria-valuemax={10}
              aria-valuenow={noticeSeconds}
              className="h-1 overflow-hidden rounded-sm bg-chip-bg"
            >
              <div
                className="h-1 rounded-sm bg-primary transition-[width] duration-1000 ease-linear"
                style={{ width: `${noticeSeconds * 10}%` }}
              />
            </div>
            {undo && (
              <p className="text-xs text-muted-foreground">
                取り消すと、戻す直前の版へもう一度戻します。履歴には「復元」が2つ積まれます。何回でもできます。
              </p>
            )}
          </div>
        </div>
      )}
      {/* 板（1280）: 一覧の欄 360px・比較の欄 440px。390 では別画面にして mobileTab で行き来する */}
      <div className="grid min-w-0 md:grid-cols-[minmax(0,360px)_minmax(0,440px)]">
        <aside
          aria-label="保存された版"
          className={`${mobileTab === 'list' ? 'flex' : 'hidden'} min-w-0 flex-col border-border bg-card max-sm:min-h-[calc(100dvh-56px)] md:flex md:border-r md:pb-4`}
        >
          {/* 板: 一覧の上に使い方の一文（余白 10px 16px・12px・mfg）。行は欄の端まで広げる */}
          {/* 板: 1280 は「…を下に出します」（比較は一覧の右の欄の下に出る）、390 は「…を出します」。 */}
          <p className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
            <span className="md:hidden">2つ選ぶと、何が変わったかを出します</span>
            <span className="max-md:hidden">2つ選ぶと、何が変わったかを下に出します</span>
          </p>
          {(loading || listError || (!loading && !listError && rows.length === 0)) && (
            <div className="space-y-2 p-4">
              {loading && (
                <p role="status" aria-busy="true" className="rounded bg-muted p-6">
                  履歴を読み込み中…
                </p>
              )}
              {listError && (
                <div role="alert" className={listBox}>
                  <p className="text-sm font-semibold">履歴を読み込めませんでした。</p>
                  <button type="button" className={control} onClick={() => void load()}>
                    再試行
                  </button>
                </div>
              )}
              {!loading && !listError && rows.length === 0 && (
                <div className={listBox}>
                  <p className="text-sm font-semibold">保存された版がありません。</p>
                  <p className="text-[13px] leading-[1.6] text-muted-foreground">
                    編集して保存すると、ここに版が残ります。
                  </p>
                </div>
              )}
            </div>
          )}
          {/* 板「版が1つしかありません。保存すると変更を比べられます。」: 理由と版の行を同じ箱に入れる。
              比べる相手が無いので、行には比較のボタンも選択の地も付けない（比較欄は別の文を出す）。 */}
          {!loading && !listError && single && (
            <div className="p-4">
              <div className={listBox}>
                <p className="text-sm font-semibold">版が1つしかありません。保存すると変更を比べられます。</p>
                <ol>
                  <li>{versionEntry(rows[0], true)}</li>
                </ol>
              </div>
            </div>
          )}
          <ol>
            {listRows.map((group) => {
              if (group.kind === 'single') return <li key={group.version.revision}>{versionEntry(group.version)}</li>;
              const newest = group.versions[0];
              const oldest = group.versions[group.versions.length - 1];
              // WHY: 古い版を追加読み込みするとまとまりの下端(oldest)が伸びる。
              //      開閉キーに newest を使うと読み込みで区切りが変わっても
              //      開いていた内訳が閉じない。
              const open = expanded.has(newest.revision);
              const listId = `version-group-${newest.revision}`;
              // まとまりの行の操作が指すのは最新の版なので、押下状態は最新の版を選んでいる時だけにする。
              // 内側の版を選んだ時は、まとまりを開いて中の行が示す（上の effect）。閉じたままの行が
              // 「選択中」と言うと、操作が指す版（最新）と食い違うため。
              const marks = (selection: string) => newest.revision === selection;
              const selectedRow = marks(from);
              const span = groupSpan(group.versions);
              const end = groupEnd(span.first, span.last);
              const name = `版 ${oldest.revision}〜${newest.revision} の最新・版 ${newest.revision}`;
              return (
                <li key={`group-${newest.revision}`}>
                  <div className={`${verRow} ${selectedRow ? verSelected : ''}`}>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-semibold">
                        <span>
                          <time dateTime={span.first}>{groupStart(span.first)}</time>
                          {end !== null && (
                            <>
                              〜<time dateTime={span.last}>{end}</time>
                            </>
                          )}
                          {/* 板「10:02〜10:09 の自動保存」と同じく、時刻と語の間を空ける */} の編集
                        </span>
                        {newest.revision === revision && (
                          <span className={selectedRow ? tagCurrentOnSelected : tagCurrent}>現在</span>
                        )}
                        {/* 板: 開閉はタイトル横のタグ「N版 ▾」。押せるタグなので枠の見た目は .tag のまま、フォーカスだけ足す。
                            見た目は高さ 20px のまま、::before を上下 10px・左右 8px 外へ出して当たり判定を 40px 以上にする。 */}
                        <button
                          type="button"
                          className={`${tagChip} ${selectedRow ? tagOnSelected : ''} relative gap-1 before:absolute before:-inset-x-2 before:-inset-y-2.5 before:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
                          aria-expanded={open}
                          aria-controls={open ? listId : undefined}
                          aria-label={`版 ${oldest.revision}〜${newest.revision} の${open ? '内訳を閉じる' : '内訳を開く'}`}
                          onClick={() =>
                            setExpanded((previous) => {
                              const next = new Set(previous);
                              if (open) next.delete(newest.revision);
                              else next.add(newest.revision);
                              return next;
                            })
                          }
                        >
                          {group.versions.length}版 <span aria-hidden="true">{open ? '▴' : '▾'}</span>
                        </button>
                      </p>
                      <p className="break-all text-xs text-muted-foreground">
                        保存 {group.versions.length}回 · 版 {oldest.revision}〜{newest.revision}
                      </p>
                    </div>
                    {/* まとまりの行の操作は、その中で最も新しい版を選ぶ */}
                    {pickButtons(newest.revision, name, marks(from), marks(to))}
                  </div>
                  {open && (
                    <ol id={listId} className="border-b border-border pr-4 pl-8">
                      {group.versions.map((version) => (
                        <li key={version.revision}>{childEntry(version, span.first)}</li>
                      ))}
                    </ol>
                  )}
                </li>
              );
            })}
          </ol>
          {more && (
            <button
              type="button"
              className={`${control} mx-4 mt-3 w-[calc(100%-2rem)]`}
              disabled={loading}
              onClick={() => void load(true)}
            >
              前の版を読み込む
            </button>
          )}
          {undo && (
            <button
              type="button"
              className={`${control} mx-4 mt-3 w-[calc(100%-2rem)]`}
              disabled={busy || Boolean(restoreBlockedReason)}
              onClick={() => void prepare(undo.target, undo.expected, true)}
            >
              復元前の版 {undo.target} を確認
            </button>
          )}
          {/* 板（390）: 一覧画面の下に高さ 48px・幅いっぱいの主ボタン「変更を見る（時刻 → 現在）」 */}
          <div className="sticky bottom-0 mt-auto border-t border-border bg-card p-4 md:hidden">
            <button
              type="button"
              className={`${primary} min-h-12 w-full`}
              ref={showCompareRef}
              disabled={busy || rows.length < 2 || !from || !to}
              onClick={() => {
                mobileFocusRef.current = true;
                setMobileTab('compare');
              }}
            >
              変更を見る（{from ? clockOf(from) : '—'} → {to === revision ? '現在' : to ? clockOf(to) : '—'}）
            </button>
          </div>
        </aside>
        <div
          className={`${mobileTab === 'compare' ? 'flex' : 'hidden'} min-h-[calc(100dvh-56px)] min-w-0 flex-col md:flex md:min-h-[calc(100dvh-80px)]`}
        >
          {/* 板では比較元・比較先は一覧の行のボタンで選ぶので、比較欄に選択欄は置かない */}
          <div className="flex-1 space-y-4 p-4">
            {compareError ? (
              <div role="alert">
                差分を読み込めませんでした。
                <button type="button" className={control} onClick={() => setCompareAttempt((x) => x + 1)}>
                  差分を再読み込み
                </button>
              </div>
            ) : single ? (
              // 板「戻した後・空・失敗」: 比較できる版が無い時は、一覧側の箱と同じく比較欄にも理由を出す。
              <p>まだ比べる版がありません</p>
            ) : sameVersion ? (
              // 同じ版を2つ選んでいる間は比べる差分が無いので、差分ではなく選び直しを促す（戻すも押せない）。
              <p role="status">同じ版を選んでいます。比べる版をもう1つ選んでください。</p>
            ) : !pair ? (
              // WHY: pair が無い理由は一覧の失敗・0件・取得中の3つ。一覧の状態から決め、
              //      失敗と0件で「読み込み中」を出し続けないようにする。
              //      失敗は rows が空の時だけ。rows が残っていれば一覧は使えるので、
              //      版を選び直した直後の取得中は「読み込み中」を出す。
              //      一覧側の role=alert が既に読み上げるため、ここは role を付けない。
              listError && rows.length === 0 ? (
                <p>一覧を読み直してください</p>
              ) : !loading && rows.length === 0 ? (
                <p>まだ比べる版がありません</p>
              ) : (
                <p role="status" aria-busy="true">
                  差分を読み込み中…
                </p>
              )
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
                {targetSnapshot && !targetSnapshot.validation.editable && (
                  // 板「読めない・戻せない」: 箱（listBox）に1文。板の「全項目の原文を確認」「この版に戻す（無効）」は
                  // 比較欄の下のボタン行にある。原文と問題箇所の案内は2文目に残す。
                  <div role="alert" className={listBox}>
                    <p className="text-[13px] leading-[1.6] text-muted-foreground">
                      この版は今の入力ルールに合わないため戻せません。
                    </p>
                    <p className="text-xs text-muted-foreground">
                      「全項目の原文を確認」で、原文と問題箇所を確認できます。
                    </p>
                  </div>
                )}
                {view === 'preview' ? (
                  <SnapshotPreview snapshot={targetSnapshot ?? pair.to} referenceMonth={referenceMonth} />
                ) : (
                  <>
                    {/* 390 の見出しは帯に出す（板）。ここは 1280 だけ */}
                    <h2 className="text-base font-semibold max-sm:hidden">{compareHeading}</h2>
                    <p className="text-xs">
                      <span className="font-semibold text-danger">比較元 · 削除 {timeOf(from)}</span>
                      {' → '}
                      <span className="font-semibold text-accent-text">
                        比較先 · 追加 {timeOf(to)}
                        {to === revision ? '（現在）' : ''}
                      </span>
                    </p>
                    {differences.length === 0 ? <p>内容は同じです。</p> : <DiffFrames differences={differences} />}
                    <p className="text-xs text-muted-foreground">省略せず、変わった項目は全部並べます。</p>
                  </>
                )}
              </>
            )}
            {restoreError && !confirmation && (
              // 板「読めない・戻せない」: 箱の中に、地 dels・文字 del の注意と、右寄せの「閉じる」「再試行」。
              <div className={listBox}>
                <p role="alert" className="rounded bg-danger-soft px-3 py-2.5 text-[13px] leading-[1.6] text-danger">
                  復元の確認を取得できませんでした。内容は変更していません。もう一度お試しください。
                </p>
                <div className="flex justify-end gap-2">
                  <button type="button" className={control} onClick={() => setRestoreError(false)}>
                    閉じる
                  </button>
                  <button
                    type="button"
                    className={primary}
                    disabled={busy || Boolean(restoreBlockedReason)}
                    onClick={() => {
                      const last = lastPrepare.current;
                      if (last) void prepare(last.target, last.expected, last.reviewTarget);
                    }}
                  >
                    再試行
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* 板（390）: 比較画面の下は高さ 48px・幅いっぱいの主ボタンだけ。「全項目の原文を確認」は
              欄内の「選択した版の全体プレビュー」と同じ動きなので 390 では畳む。1280 では右寄せの2ボタン。
              比較の欄は 440px で注記と2ボタンが1行に収まらないため、注記は独立行にしてボタン行は右寄せにする */}
          <footer className="sticky bottom-0 mt-auto border-t border-border bg-card p-4">
            <span className="block text-sm text-muted-foreground max-sm:hidden">いまの内容も履歴に残ります。</span>
            <div className="mt-2 flex flex-wrap items-center justify-end gap-2 max-sm:mt-0">
              <button
                type="button"
                className={`${control} max-sm:hidden`}
                disabled={!pair || sameVersion}
                onClick={() => setView('preview')}
              >
                全項目の原文を確認
              </button>
              <button
                type="button"
                className={`${primary} max-sm:min-h-12 max-sm:w-full`}
                disabled={
                  busy ||
                  Boolean(restoreBlockedReason) ||
                  !pair ||
                  restoreTarget === null ||
                  sameVersion ||
                  !targetSnapshot ||
                  !targetSnapshot.validation.editable ||
                  !currentSnapshot ||
                  JSON.stringify({ title: currentSnapshot.title, blocks: currentSnapshot.blocks }) ===
                    JSON.stringify({ title: targetSnapshot.title, blocks: targetSnapshot.blocks }) ||
                  conflict
                }
                onClick={() => void prepare()}
              >
                {busy ? '処理中…' : 'この版に戻す'}
              </button>
            </div>
          </footer>
        </div>
      </div>
      <AlertDialog.Root
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setConfirmation(null);
            // 確認を閉じたら、確認の中で出した復元の失敗の表示も消す（比較欄の「確認を取得できませんでした」と混ざらないように）。
            setRestoreError(false);
          }
        }}
      >
        <AlertDialog.Portal>
          {/* 板のダイアログ: オーバーレイ rgba(16,23,26,.45)（暗い配色は .66 の黒）、
              最大幅 480px・角丸 8px・内側 24px（390px では 20px）・中の間隔 10px */}
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-[rgba(16,23,26,.45)] dark:bg-[rgba(0,0,0,.66)]" />
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
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 flex-col gap-2.5 overflow-y-auto rounded-xl border border-border bg-card p-6 text-foreground shadow-[0_18px_44px_-18px_rgba(16,23,26,.38)] max-sm:p-5 dark:shadow-[0_18px_44px_-18px_rgba(0,0,0,.66)]"
          >
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text"
                aria-hidden="true"
              >
                <Info className="h-4 w-4" />
              </span>
              {/* 板の題名: 16px・太さ 700・行高 1.6 */}
              <AlertDialog.Title className="min-w-0 break-words text-base font-bold leading-[1.6]">
                {undoWithEdits
                  ? `戻したあとに ${laterEdits}件 の編集があります`
                  : `版 ${confirmation?.target.revision} の状態に戻します。`}
              </AlertDialog.Title>
            </div>
            {/* 板の本文: 13.5px・行高 1.8・左 44px（390px では 0）。以降の内容も同じ段に揃える */}
            <AlertDialog.Description className="break-words pl-11 text-[13.5px] leading-[1.8] text-muted-foreground max-sm:pl-0">
              {undoWithEdits
                ? `取り消すと、その${laterEdits}件の編集も元に戻ります（履歴には残ります）。`
                : confirmation?.current.validation.editable
                  ? 'いまの内容も履歴に残るので、あとから戻せます。'
                  : '復元前の内容は履歴に残りますが、現在の入力ルールでは戻せません。'}
            </AlertDialog.Description>
            {/* 板（戻す前の確認）の注意: 地 warns・文字 warn・角丸 4px・余白 10px 12px・13px。
                取り消しの確認では、題と本文が同じことを言うので出さない（件数が 0 の時は何も出さない） */}
            {confirmation && !undoConfirmation && laterEdits > 0n && (
              <p className="ml-11 rounded bg-warn-soft px-3 py-2.5 text-[13px] leading-[1.6] text-warn-strong max-sm:ml-0">
                この版のあとに {String(laterEdits)}件 の編集があります。戻すと、その{String(laterEdits)}
                件の変更も消えます（履歴には残ります）。
              </p>
            )}
            {confirmation?.visibilityUncertain && (
              <p role="alert" className="ml-11 font-semibold max-sm:ml-0">
                現在の内容が編集不能のため、公開範囲の差を完全には確認できません。選択した版の全内容を確認してください。
              </p>
            )}
            {Boolean(confirmation?.newlyVisible.length) && (
              <div className="ml-11 max-sm:ml-0">
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
            {confirmation && (
              <details
                className="ml-11 min-w-0 rounded border border-border p-3 max-sm:ml-0"
                open={confirmationReviewOpen}
                onToggle={(event) => setConfirmationReviewOpen(event.currentTarget.open)}
              >
                <summary className="cursor-pointer py-2 text-sm font-semibold">戻す内容と変更点を確認</summary>
                <div className="mt-3 min-w-0 space-y-4">
                  <SnapshotPreview snapshot={confirmation.target} referenceMonth={referenceMonth} />
                  <h3 className="text-sm font-semibold">いまの内容から変わる項目</h3>
                  <DiffFrames
                    headingLevel={4}
                    differences={documentDifferences(
                      { title: confirmation.current.title, blocks: confirmation.current.blocks },
                      { title: confirmation.target.title, blocks: confirmation.target.blocks },
                    )}
                  />
                  {confirmation.sameContent && <p className="text-sm">いまの内容と同じです。</p>}
                </div>
              </details>
            )}
            {confirmation && !confirmation.canRestore && (
              <p role="alert" className="ml-11 max-sm:ml-0">
                {confirmation.sameContent
                  ? 'いまの内容と同じため戻す必要はありません。'
                  : 'この版は今の入力ルールに合わないため戻せません。'}
              </p>
            )}
            {restoreError && (
              <p role="alert" className="ml-11 max-sm:ml-0">
                復元の完了を確認できませんでした。再試行するか、やめるを選んでください。
              </p>
            )}
            {/* 板: ボタンは右寄せで間隔 8px。390 では縦に並べて幅いっぱい・主ボタンが上 */}
            <div className="flex flex-wrap justify-end gap-2 max-sm:flex-col">
              <AlertDialog.Close asChild>
                <button ref={cancelRef} type="button" className={dialogNormal} disabled={busy}>
                  やめる
                </button>
              </AlertDialog.Close>
              <button
                type="button"
                className={`${dialogPrimary} max-sm:order-first`}
                disabled={busy || Boolean(restoreBlockedReason) || !confirmation?.canRestore}
                onClick={() => void restore()}
              >
                {busy ? '復元中…' : restoreError ? '再試行' : undoWithEdits ? '取り消す' : '戻す'}
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <AlertDialog.Root open={conflict}>
        <AlertDialog.Portal>
          {/* 板のダイアログと同じ寸法（戻す前の確認と揃える）。競合は注意の丸アイコン */}
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-[rgba(16,23,26,.45)] dark:bg-[rgba(0,0,0,.66)]" />
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
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 flex-col gap-2.5 overflow-y-auto rounded-xl border border-border bg-card p-6 text-foreground shadow-[0_18px_44px_-18px_rgba(16,23,26,.38)] max-sm:p-5 dark:shadow-[0_18px_44px_-18px_rgba(0,0,0,.66)]"
          >
            <div className="flex items-start gap-3">
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warn-soft text-warn-strong"
                aria-hidden="true"
              >
                <TriangleAlert className="h-4 w-4" />
              </span>
              <AlertDialog.Title className="min-w-0 break-words text-base font-bold leading-[1.6]">
                ほかの画面かツールで更新されました。
              </AlertDialog.Title>
            </div>
            <AlertDialog.Description className="break-words pl-11 text-[13.5px] leading-[1.8] text-muted-foreground max-sm:pl-0">
              最新の履歴を読み込んでから、もう一度選んでください。
            </AlertDialog.Description>
            <div className="flex flex-wrap justify-end gap-2 max-sm:flex-col">
              <AlertDialog.Close asChild>
                <button
                  type="button"
                  className={`${dialogPrimary} max-sm:order-first`}
                  onClick={() => {
                    setConflict(false);
                    setConfirmation(null);
                    onReload();
                  }}
                >
                  最新を読み込む
                </button>
              </AlertDialog.Close>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </section>
  );
}
