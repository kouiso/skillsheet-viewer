'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { TRPCClientError } from '@trpc/client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/component/ui/button';
import { useThemeMode } from '@/context/theme-context';
// 型・純関数はサーバ専用モジュール（neon ドライバ等）を client バンドルに巻き込まないため、
// root の @/db ではなく純粋サブエクスポート @/db/block から import する
// （詳細は serialize.ts の同趣旨コメント）。
import {
  type Block,
  type ExperienceBlockData,
  isBlockInputEmpty,
  type ProfileBlockData,
  type ProjectBlockData,
  type SkillEntry,
  type StatsBlockData,
  type TableColumn,
} from '@/db/block';
import { currentMonthKey } from '@/db/derived-display';
import { isRevision, validateDocumentBlocks } from '@/db/document-contract';
import type { DocumentSnapshot } from '@/db/document-service';
import { trpc } from '@/lib/trpc-client';
import { BlockAddMenu } from './block-add-menu';
import { type CustomMetaRow, hasUncommittedProfileRows } from './block-editor/profile-block-editor';
import { CanvasDroppable } from './canvas/canvas-droppable';
import { createPaletteItem, DragPreview, PALETTE_ITEMS, type PaletteBlockType, PaletteChip } from './canvas/palette';
import { SortableBlock } from './canvas/sortable-block';
import { CreateSheetDialog } from './create-sheet-dialog';
import { type HistoryEntry, loadHistory, pushHistory } from './history';
import { HistoryDrawer } from './history-drawer';
import { ProjectEditor } from './project-editor';
import { projectBlockingWarnings, projectWarnings } from './project-warning';
import { saveWithReadback } from './save-readback';
import {
  assembleMarkdown,
  blockToItem,
  type EditorItem,
  itemsToDocumentBlocks,
  itemToBlockInput,
  newId,
  snapshot,
} from './serialize';
import { TEMPLATES } from './sheet-template';
import { usePendingOperation } from './use-pending-operation';
import { useWorkspaceConfirm } from './use-workspace-confirm';
import { type RestoreResult, VersionHistory } from './version-history';
import { WorkspaceBlockPreview } from './workspace-block-preview';
import { WorkspaceOutline } from './workspace-outline';
import { WorkspaceState } from './workspace-state';
import { WorkspaceTopbar } from './workspace-topbar';

// 分割前（builder-client.tsx 1 枚だった頃）と同じ import 元を保つための再エクスポート。
// 実体は serialize.ts にある。既存の import 元（テスト等）を書き換えずに済ませる。
export type { EditorItem };
export { assembleMarkdown, blockToItem };

type SheetSummary = { id: string; title: string; updatedAt: Date };

const REVOKE_DELAY_MS = 100;
const PREVIEW_DEBOUNCE_MS = 300;
// 別ウィンドウプレビューとの連携キー。app/builder/preview/preview-client.tsx と共有。
const PREVIEW_CHANNEL_NAME = 'builder-preview';
/** 別窓プレビューへ送る生存確認の間隔。受信側の「途切れた」判定より十分短くする。 */
const PREVIEW_HEARTBEAT_MS = 4000;
const PREVIEW_STORAGE_KEY = 'builder-preview-payload';

// 編集が止んでから自動保存を発火するまでの待ち時間。
// design（editor/app.jsx）は 600ms。手を止めた瞬間に「保存済み」へ変わる体感を狙った値で、
// 案件エディタは 1 フィールドずつ触る操作が多いため長い待ちだと保存状態が読み取れない。
const AUTOSAVE_DEBOUNCE_MS = 600;

/** シート一覧の鮮度保持時間。react-query の既定 staleTime: 0 だと RSC が渡した
 * initialData が即座に stale 扱いになり、マウント直後に取得済みの一覧を HTTP で
 * 二重取得してしまう。作成・削除後の更新は invalidate() が明示的に担う。 */
const SHEET_LIST_STALE_TIME_MS = 60_000;

// 自動保存の状態機械。idle（初期）→ saving → saved を巡回し、
// conflict は終端（同一セッション中は自動保存を再開しない）。
// error は非競合の失敗（unauthorized / ネットワーク等）。同一内容での自動リトライは行わず、
// 新しい編集が入ったときだけ再試行する（失敗ループでサーバを叩き続けない）。
type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'conflict' | 'error' | 'invalid';

// 入力バリデーション起因の自動保存失敗をネットワーク等の一時的失敗と区別する印。
// 手動保存も同じ検証で止まるため、「保存ボタンで再試行」の案内は誤った指示になる（#353）。
class AutosaveValidationError extends Error {}

interface BuilderClientProps {
  initialBlocks: Block[];
  initialTitle: string;
  /**
   * 本文と同一スナップショットから取った初期版（R01）。一覧（sheets）の別取得値を
   * 使うと版と本文の読取時点がずれ、保存 CAS が誤作動/すり抜けるため分離した。
   * 文字列の0も有効な初期版。シート未作成はactiveSheetIdの欠落で区別する。
   */
  initialRevision: string;
  rawSnapshot?: DocumentSnapshot;
  sheets: SheetSummary[];
  activeSheetId: string;
  /**
   * サーバ側でシートを読めなかったときの理由。
   * null なら正常（＝空なら本当にまだ何も無い）。
   * 以前はここを渡しておらず、読み込み失敗でも空の編集画面が出るだけだったため、
   * 利用者は「保存したものが消えた」と誤解した。
   */
  loadFailure?: 'config' | 'unknown' | 'uneditable' | 'invalid-state' | 'not-found' | null;
}

const BuilderClient = ({
  initialBlocks,
  initialTitle,
  initialRevision,
  sheets: initialSheets,
  activeSheetId,
  loadFailure: initialLoadFailure = null,
  rawSnapshot,
}: BuilderClientProps) => {
  const [loadFailure, setLoadFailure] = useState(initialLoadFailure);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [historyOpening, setHistoryOpening] = useState(false);
  const historyOpeningRef = useRef(false);
  const router = useRouter();
  const { confirm, dialog: confirmationDialog } = useWorkspaceConfirm({
    fallbackFocus: () => document.querySelector<HTMLButtonElement>('[data-workspace-focus]'),
  });
  const { mode, toggleTheme } = useThemeMode();
  const newProjectBlockIdRef = useRef(newId());
  const [items, setItems] = useState<EditorItem[]>(() => initialBlocks.map(blockToItem));
  const [deletedBlock, setDeletedBlock] = useState<{
    item: EditorItem;
    index: number;
    draft?: CustomMetaRow[];
    blocked: boolean;
  } | null>(null);
  useEffect(() => {
    if (!deletedBlock) return;
    const timeout = setTimeout(() => setDeletedBlock(null), 10000);
    return () => clearTimeout(timeout);
  }, [deletedBlock]);
  const [selectedBlockId, setSelectedBlockId] = useState(initialBlocks[0]?.id ?? 'new-project');
  const [warningJump, setWarningJump] = useState<{
    blockId: string;
    projectId: string;
    field: 'title' | 'period';
    target: string;
    token: number;
  }>();
  const warningJumpSequenceRef = useRef(0);
  const [profileWarningJump, setProfileWarningJump] = useState<{ blockId: string; token: number; selector: string }>();
  const projectInputWarnings = items.flatMap((item) =>
    item.type === 'project'
      ? item.data.items.flatMap((project) =>
          projectWarnings(project).map((warning) => ({ ...warning, blockId: item.id, projectId: project.id })),
        )
      : [],
  );
  const blockingPeriodWarnings = projectBlockingWarnings(itemsToDocumentBlocks(items));
  const warnings = projectInputWarnings.filter(
    (warning) =>
      warning.field !== 'period' ||
      !blockingPeriodWarnings.some(
        (issue) => issue.blockId === warning.blockId && issue.projectId === warning.projectId,
      ),
  );
  const [selectedProjectId, setSelectedProjectId] = useState(
    initialBlocks.find((block) => block.type === 'project')?.id ?? 'new-project',
  );
  // 履歴は並び順や削除に依存せず、同じ案件ブロックIDに帰属させる。
  const historyKey = `${activeSheetId}:${selectedProjectId === 'new-project' ? newProjectBlockIdRef.current : selectedProjectId}`;
  // 案件エディタの右ペイン（ライブプレビュー）の表示。トップバーから切り替える。
  const [showProjectPreview, setShowProjectPreview] = useState(true);
  // 案件エディタの変更履歴（localStorage 保存・このブラウザ限定）
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  // localStorage はサーバ側に無いため、マウント後に読む（SSR とマークアップを食い違わせない）
  useEffect(() => {
    setHistory(loadHistory(historyKey));
  }, [historyKey]);
  const [title, setTitle] = useState(initialTitle);
  const [isSaving, startSaving] = usePendingOperation();
  const [isSheetOp, startSheetOp] = usePendingOperation();
  // 認可・入力検証・エラーコードを tRPC procedure 側に集約したので、ここでは
  // mutateAsync を素の非同期関数として呼び、既存の直列化ロジック（saveInFlightRef 等）は変えない。
  const restoreVersionMutation = trpc.sheet.history.restore.useMutation();
  const saveMutation = trpc.sheet.save.useMutation();
  const createMutation = trpc.sheet.create.useMutation();
  const deleteMutation = trpc.sheet.delete.useMutation();
  const utils = trpc.useUtils();
  // RSC が渡す initialSheets を initialData にして、作成/削除後は invalidate() で
  // react-query に再取得させる（手動での配列操作をやめ、正本を一箇所に保つ）。
  // sheet.list は一覧の鮮度（stale）も返すようになったが（Issue #204 の一覧版）、
  // ビルダーのサイドバーは編集者自身の操作直後に invalidate() で追従させる前提のため
  // 鮮度表示までは持たない。
  const { data: sheetsList } = trpc.sheet.list.useQuery(undefined, {
    initialData: { sheets: initialSheets, stale: false },
    staleTime: SHEET_LIST_STALE_TIME_MS,
  });
  const sheets = sheetsList.sheets;
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newSheetTitle, setNewSheetTitle] = useState('新しいスキルシート');
  // R01 並行保存ガード: 編集開始時の版番号を保持し、保存成功時にサーバが返す
  // 新版で更新して次回保存の基準にする。版は本文と同一スナップショットから渡される
  // initialRevision で初期化する（以前は別取得の一覧 updatedAt を使っており、
  // 本文と版の読取時点がずれ得た）。文字列0も有効で、文書未作成はIDの欠落で区別する。
  const savedRevisionRef = useRef<string>(initialRevision);
  const [newSheetTemplateId, setNewSheetTemplateId] = useState(TEMPLATES[0].id);
  const createInFlightRef = useRef(false);
  const createOperationRef = useRef<{
    key: string;
    sheetId: string;
    title: string;
    blocks: ReturnType<typeof itemsToDocumentBlocks>;
  } | null>(null);
  // サイドバーの sheet.list は staleTime: 60s の間 initialData を再利用し続けるため、
  // タイトルを変更して保存しても react-query 側は自動では気づかない。保存成功時に
  // タイトルが変わっていた場合だけ invalidate してサイドバー表示を追従させる
  // （毎回 invalidate すると自動保存のたびに一覧を再取得してしまい staleTime の意味が薄れる）。
  const savedTitleRef = useRef(initialTitle);
  const [activePaletteType, setActivePaletteType] = useState<PaletteBlockType | null>(null);

  // 未保存変更の検知。最後に保存成功した時点のスナップショット（タイトル＋構造化ブロック）を
  // 保持し、現在の内容と差分があれば dirty とみなす（保存成功で更新）。
  const lastSavedSnapshotRef = useRef<string>(snapshot(initialBlocks.map(blockToItem), initialTitle));
  const [isDirty, setIsDirty] = useState(false);

  // SPA 内遷移（シート切替・閲覧へ等）は beforeunload が発火せず、key={activeSheetId} の
  // 再マウントで編集中 state が黙って破棄されるため、dirty 時は明示的に確認を取る。
  const confirmDiscardChanges = async () =>
    (!isDirty && blockedItemIds.size === 0) ||
    (await confirm({
      title: 'まだ保存していない変更があります。',
      description: 'このまま移動すると、この画面の未保存の変更は失われます。',
      confirmLabel: '変更を捨てて移動',
      cancelLabel: '編集に戻る',
      danger: true,
    }));

  // --- 自動保存（Phase 3） ---
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  const [authExpired, setAuthExpired] = useState(false);
  const [savedAt, setSavedAt] = useState<Date>();
  const [lastSaveKind, setLastSaveKind] = useState<'auto' | 'manual' | 'restore'>('auto');
  // 競合検出後は自動保存を恒久停止する（競合スパム防止）。state と別に ref でも持ち、
  // 非同期コールバック内から最新値を同期参照できるようにする。
  // 読み込みに失敗したまま保存すると、sheetId が空のまま既定シートへ書き込まれ、
  // 読めなかっただけの既存内容を「いま画面にある空同然の内容」で上書きしてしまう。
  // 失敗が出ている間は自動保存も手動保存も行わない（再読み込みで復帰させる）。
  const autosaveStoppedRef = useRef(loadFailure !== null || !activeSheetId);
  // 保存実行中フラグ（自動/手動で共有）。実行中に再度 dirty になった場合は
  // followUpRef を立て、完了後にちょうど 1 回だけ追撃保存する。
  const saveInFlightRef = useRef(false);
  const followUpRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      followUpRef.current = false;
    };
  }, []);
  // 直近の自動保存が失敗した時点のスナップショット。デバウンス効果はこれと同一内容の間は
  // タイマーを再armしない（status 遷移だけで 1.5 秒ごとの無限リトライになるのを防ぐ）。
  const failedSnapshotRef = useRef<string | null>(null);
  // デバウンス満了時・追撃保存時に最新の items/title を参照するための ref
  // （デバウンスタイマーのクロージャが古い state を掴むのを防ぐ）。
  const itemsRef = useRef(items);
  const titleRef = useRef(title);
  useEffect(() => {
    itemsRef.current = items;
    titleRef.current = title;
  }, [items, title]);

  // プロフィールブロックの自由項目でラベルが重複している間は保存をブロックする。
  // ProfileBlockEditor 側は衝突した行を data.meta から除外して onChange するため
  // （#193）、除外後の meta だけを見る自動保存はこの重複自体を検知できない。
  // ブロックごとに衝突有無を報告してもらい、1件でもあれば自動保存・手動保存の
  // どちらも止める（除外＝保存を止めないと、600ms のデバウンス満了で消えた値が
  // そのまま自動保存されてしまう。Codex レビュー指摘）。
  const [blockedItemIds, setBlockedItemIds] = useState<Set<string>>(new Set());
  const blockedItemIdsRef = useRef(blockedItemIds);
  useEffect(() => {
    blockedItemIdsRef.current = blockedItemIds;
  }, [blockedItemIds]);
  const handleProfileValidityChange = useCallback((id: string, hasConflict: boolean) => {
    const effectiveConflict = hasConflict || hasUncommittedProfileRows(profileCustomDraftsRef.current.get(id) ?? []);
    setBlockedItemIds((prev) => {
      const has = prev.has(id);
      if (effectiveConflict === has) return prev;
      const next = new Set(prev);
      if (effectiveConflict) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  // ProfileBlockEditor 内の任意メタ項目行はタブ切替等でアンマウントされても入力中の
  // 未確定値を失わないよう、ブロック id 単位でドラフトを保持する（#216）。
  const profileCustomDraftsRef = useRef<Map<string, CustomMetaRow[]>>(new Map());
  const getProfileCustomDraft = useCallback((id: string) => profileCustomDraftsRef.current.get(id), []);
  const setProfileCustomDraft = useCallback((id: string, rows: CustomMetaRow[]) => {
    profileCustomDraftsRef.current.set(id, rows);
  }, []);
  const hasBlockedDraft = () =>
    blockedItemIdsRef.current.size > 0 || [...profileCustomDraftsRef.current.values()].some(hasUncommittedProfileRows);
  const blockedProfileIds = items
    .filter((item) => item.type === 'profile' && blockedItemIds.has(item.id))
    .map((item) => item.id);
  const warningCount = warnings.length;
  const blockingCount = blockingPeriodWarnings.length + blockedProfileIds.length;
  const inputIssueCount = warningCount + blockingCount;

  const moveBlock = useCallback((id: string, direction: -1 | 1) => {
    setItems((prev) => {
      const index = prev.findIndex((i) => i.id === id);
      if (index === -1) return prev;
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      return arrayMove(prev, index, target);
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  // プレビューは重い（Markdown パース＋ハイライト）ため、入力のたびではなく
  // デバウンスして更新し、タイピングのラグを防ぐ。初期値・初回レンダリングは即時反映。
  const [referenceMonth] = useState(() => currentMonthKey(new Date()));
  const [previewContent, setPreviewContent] = useState(() => assembleMarkdown(items, { referenceMonth }));
  const isFirstPreviewRender = useRef(true);

  useEffect(() => {
    // useState の初期値で既に assembleMarkdown(items, { referenceMonth }) 評価済みのため、
    // マウント直後の再計算は不要（重い Markdown パース処理の二重実行を避ける）。
    if (isFirstPreviewRender.current) {
      isFirstPreviewRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setPreviewContent(assembleMarkdown(items, { referenceMonth }));
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [items, referenceMonth]);

  // 別ウィンドウプレビューへ変更をリアルタイム反映する BroadcastChannel。
  // 別窓が開いていなくても postMessage は無害なので購読側の有無は気にしない。
  const previewChannelRef = useRef<BroadcastChannel | null>(null);
  const previewSessionRef = useRef(newId());
  const previewSequenceRef = useRef(0);
  const previewPayload = useCallback(
    (previewTitle: string, content: string) => ({
      title: previewTitle,
      content,
      sessionId: previewSessionRef.current,
      sequence: ++previewSequenceRef.current,
    }),
    [],
  );
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel(PREVIEW_CHANNEL_NAME);
    } catch {
      return;
    }
    previewChannelRef.current = channel;
    return () => {
      channel.close();
      previewChannelRef.current = null;
    };
  }, []);

  useEffect(() => {
    previewChannelRef.current?.postMessage(previewPayload(title, previewContent));
  }, [title, previewContent, previewPayload]);

  // 生存確認の定期送信。編集の手が止まっている間も別窓が「同期が途切れた」と誤判定しないよう、
  // 内容が変わらなくても一定間隔で同じ内容を送り直す。受信側は最終受信時刻だけを見る。
  useEffect(() => {
    const timer = window.setInterval(() => {
      previewChannelRef.current?.postMessage(previewPayload(title, previewContent));
    }, PREVIEW_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [title, previewContent, previewPayload]);

  // 開いたプレビュー窓の参照。既に開いている場合はページ再読み込みを避け focus() するだけにする。
  const previewWindowRef = useRef<Window | null>(null);

  // ヘッダー「プレビュー」ボタン: 別ウィンドウを開く。開いた瞬間に最新内容が見えるよう
  // localStorage にシード保存してから開く（以後の更新は BroadcastChannel で追従）。
  const handleOpenPreview = () => {
    if (previewWindowRef.current && !previewWindowRef.current.closed) {
      previewWindowRef.current.focus();
      return;
    }
    try {
      localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(previewPayload(title, previewContent)));
    } catch {
      // プライベートブラウジング等で localStorage が使えなくても window.open は試みる。
    }
    const win = window.open(
      `/builder/preview?session=${encodeURIComponent(previewSessionRef.current)}`,
      `builder-preview-${previewSessionRef.current}`,
      'width=800,height=1000',
    );
    if (win) {
      previewWindowRef.current = win;
      win.focus();
    } else {
      toast.error('ポップアップがブロックされました。ブラウザの設定で許可してください。');
    }
  };

  // 現在の内容（タイトル含む）が最後の保存スナップショットと異なれば dirty にする。
  // サーバはもう空ブロックを drop しないので（issue #128）、空ブロックの追加も
  // 「保存すれば実際に DB へ残る変更」として正しく dirty 扱いになる
  // （旧コードは drop される前提で空ブロックを比較から除外していたが、その前提が消えた）。
  // 全ブロックが空の状態で dirty になる場合（例:「テキスト」を押して何も打たず放置）は
  // 自動保存されず（:942 の全消しガード）dirty のままになるが、これは意図した仕様。
  // 手動保存＋確認ダイアログ（:1194 付近）でクリアできる — 全消し保存の是非を
  // ユーザーに問う導線と一致させるため、あえて自動で dirty を解除しない。
  useEffect(() => {
    setIsDirty(snapshot(items, title) !== lastSavedSnapshotRef.current);
  }, [items, title]);

  // 未保存変更がある間だけ beforeunload を登録し、離脱時にネイティブ警告を出す。
  // dirty でなくなる／アンマウント時にはリスナーを解除する。
  useEffect(() => {
    if (!isDirty && blockedItemIds.size === 0) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 一部ブラウザは returnValue の設定でネイティブ確認を表示する。
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, blockedItemIds]);

  // 自動保存の本体。デバウンス満了時と追撃保存時に呼ばれる。
  // 保存が既に実行中なら追撃を予約して戻り、完了後にちょうど 1 回だけ再実行する。
  const runAutosave = useCallback(async () => {
    if (historyOpeningRef.current) return;
    if (!mountedRef.current || autosaveStoppedRef.current) return;
    // プロフィールの自由項目にラベル重複がある間は、除外後の meta を自動保存しない。
    if (blockedItemIdsRef.current.size > 0) return;
    if (saveInFlightRef.current) {
      followUpRef.current = true;
      return;
    }
    const currentItems = itemsRef.current;
    const currentTitle = titleRef.current;
    const savedSnapshot = snapshot(currentItems, currentTitle);
    // デバウンス待機中に手動保存などで dirty が解消していたら何もしない。
    if (savedSnapshot === lastSavedSnapshotRef.current) return;
    // データ消失ガード: 全ブロックが空なら自動保存はスキップする
    // （全消し保存の是非は手動保存の confirm に委ねる）。
    if (currentItems.every((item) => isBlockInputEmpty(itemToBlockInput(item)))) return;

    saveInFlightRef.current = true;
    setAutosaveStatus('saving');
    try {
      const payload = {
        title: currentTitle,
        blocks: itemsToDocumentBlocks(currentItems),
        sheetId: activeSheetId,
        expectedRevision: savedRevisionRef.current,
      };
      if (validateDocumentBlocks(payload.blocks).some((issue) => issue.code === 'PERIOD_PROJECTION_MISMATCH'))
        throw new AutosaveValidationError();
      const result = await saveWithReadback(payload, saveMutation.mutateAsync, (sheetId) =>
        utils.sheet.builderState.fetch({ sheetId }, { staleTime: 0 }),
      );
      if (!mountedRef.current) return;
      // 応答がネットワーク上で逆順到着しても版を後退させない（古い応答で最新版を
      // 上書きすると次回保存が誤 Conflict する）。版はサーバ採番で単調増加。
      // 版が欠けた応答（古いサーバ等）では現在値を維持する（NaN化防止）。
      if (isRevision(result.revision)) {
        savedRevisionRef.current =
          BigInt(result.revision) > BigInt(savedRevisionRef.current) ? result.revision : savedRevisionRef.current;
      }
      if (savedTitleRef.current !== currentTitle) {
        savedTitleRef.current = currentTitle;
        void utils.sheet.list.invalidate().catch(() => undefined);
      }
      lastSavedSnapshotRef.current = savedSnapshot;
      failedSnapshotRef.current = null;
      // 保存中に入った編集分が残っていれば dirty のまま（追撃保存が拾う）。
      setIsDirty(snapshot(itemsRef.current, titleRef.current) !== savedSnapshot);
      setAutosaveStatus('saved');
      setLastSaveKind('auto');
      setSavedAt(new Date());
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof TRPCClientError && err.data?.code === 'UNAUTHORIZED') {
        autosaveStoppedRef.current = true;
        followUpRef.current = false;
        failedSnapshotRef.current = savedSnapshot;
        setAuthExpired(true);
        setAutosaveStatus('error');
      } else if (err instanceof TRPCClientError && err.data?.code === 'CONFLICT') {
        // 競合は最初の 1 回で自動保存を恒久停止する（ダイアログは出さず、
        // トップバーのインジケータ＋再読み込みボタンで通知する）。
        autosaveStoppedRef.current = true;
        followUpRef.current = false;
        setAutosaveStatus('conflict');
      } else {
        // 失敗（unauthorized・ネットワークエラー等）は dirty のまま error にする。失敗した
        // スナップショットを記録し、同一内容での自動リトライは行わない
        // （新しい編集が入ったときだけ再試行）。
        // バリデーション起因は invalid — 「保存ボタンで再試行」ではなく入力の確認を促す（#353）。
        failedSnapshotRef.current = savedSnapshot;
        setAutosaveStatus(err instanceof AutosaveValidationError ? 'invalid' : 'error');
      }
    } finally {
      saveInFlightRef.current = false;
    }
    if (followUpRef.current && !autosaveStoppedRef.current) {
      followUpRef.current = false;
      void runAutosave();
    }
    // saveMutation.mutateAsync / utils.sheet.list.invalidate は @tanstack/react-query・tRPC が
    // 安定参照として返すため、依存配列に加えても再レンダーごとの再生成は起きない
    // （utils オブジェクト自体ではなく末端の関数を指定する — utils は毎レンダー新しい
    // オブジェクトを返す実装があり得るが、内部の関数参照は安定している）。
  }, [activeSheetId, saveMutation.mutateAsync, utils.sheet.list.invalidate, utils.sheet.builderState.fetch]);

  // dirty になってから AUTOSAVE_DEBOUNCE_MS 編集が止んだら自動保存する
  // （items/title が変わるたびにタイマーを引き直す＝デバウンス）。
  useEffect(() => {
    if (!isDirty || historyOpening || versionHistoryOpen || autosaveStatus === 'conflict' || blockedItemIds.size > 0)
      return;
    // 失敗直後の status 遷移（saving → error）だけでタイマーを再armしない。
    // 失敗時と同一内容のままなら再試行せず、新しい編集で snapshot が変わったときだけ再デバウンスする。
    if (
      (autosaveStatus === 'error' || autosaveStatus === 'invalid') &&
      snapshot(items, title) === failedSnapshotRef.current
    )
      return;
    const timer = setTimeout(() => {
      void runAutosave();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [items, title, isDirty, autosaveStatus, runAutosave, blockedItemIds, historyOpening, versionHistoryOpen]);

  const handleDragStart = (event: DragStartEvent) => {
    const blockType = event.active.data.current?.blockType as PaletteBlockType | undefined;
    setActivePaletteType(blockType ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const overBlockId = over?.data.current?.blockId ?? over?.id;
    setActivePaletteType(null);

    // パレットからのドロップ: over が既存ブロックなら直後に、canvas なら末尾に挿入
    if (active.data.current?.fromPalette) {
      if (!over) return;
      const blockType = active.data.current.blockType as PaletteBlockType;
      const newItem = createPaletteItem(blockType);
      setItems((prev) => {
        if (!over || over.id === 'canvas-drop') return [...prev, newItem];
        const idx = prev.findIndex((i) => i.id === overBlockId);
        if (idx === -1) return [...prev, newItem];
        const next = [...prev];
        next.splice(idx + 1, 0, newItem);
        return next;
      });
      setSelectedBlockId(newItem.id);
      return;
    }

    // 既存ブロックの並べ替え
    const activeBlockId = active.data.current?.blockId ?? active.id;
    if (!over || activeBlockId === overBlockId) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === activeBlockId);
      const newIndex = prev.findIndex((i) => i.id === overBlockId);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved);
      return next;
    });
  };

  const updateMarkdown = (id: string, markdown: string) =>
    setItems((prev) => prev.map((i) => (i.id === id && i.type === 'markdown' ? { ...i, markdown } : i)));

  const updateTable = (id: string, columns: TableColumn[], rows: string[][]) =>
    setItems((prev) => prev.map((i) => (i.id === id && i.type === 'table' ? { ...i, columns, rows } : i)));

  const updateSkills = (id: string, category: string, skills: SkillEntry[]) =>
    setItems((prev) => prev.map((i) => (i.id === id && i.type === 'skills' ? { ...i, category, skills } : i)));

  const updateExperience = (id: string, data: ExperienceBlockData) =>
    setItems((prev) => prev.map((i) => (i.id === id && i.type === 'experience' ? { ...i, ...data } : i)));

  const updateStats = (id: string, data: StatsBlockData) =>
    setItems((prev) => prev.map((item) => (item.id === id && item.type === 'stats' ? { ...item, data } : item)));

  const updateProfile = (id: string, data: ProfileBlockData) =>
    setItems((prev) => prev.map((i) => (i.id === id && i.type === 'profile' ? { ...i, ...data } : i)));

  const deleteBlock = (id: string) => {
    const index = itemsRef.current.findIndex((item) => item.id === id);
    if (index < 0) return;
    setDeletedBlock({
      item: itemsRef.current[index],
      index,
      draft: profileCustomDraftsRef.current.get(id),
      blocked: blockedItemIdsRef.current.has(id),
    });
    const nextSelected = items.find((item) => item.id !== id);
    if (selectedBlockId === id) {
      setSelectedBlockId(nextSelected?.id ?? 'new-project');
      if (nextSelected?.type === 'project') setSelectedProjectId(nextSelected.id);
    }
    if (selectedProjectId === id)
      setSelectedProjectId(items.find((item) => item.id !== id && item.type === 'project')?.id ?? 'new-project');
    profileCustomDraftsRef.current.delete(id);
    setBlockedItemIds((prev) => new Set([...prev].filter((blockedId) => blockedId !== id)));
    setItems((prev) => prev.filter((i) => i.id !== id));
  };
  const undoDeleteBlock = () => {
    if (!deletedBlock) return;
    const { item, index, draft, blocked } = deletedBlock;
    if (draft) profileCustomDraftsRef.current.set(item.id, draft);
    if (blocked) setBlockedItemIds((prev) => new Set([...prev, item.id]));
    setItems((prev) => {
      if (prev.some((existing) => existing.id === item.id)) return prev;
      const next = [...prev];
      next.splice(Math.min(index, next.length), 0, item);
      return next;
    });
    setSelectedBlockId(item.id);
    if (item.type === 'project') setSelectedProjectId(item.id);
    setDeletedBlock(null);
  };

  const addSelectedBlock = (item: EditorItem) => {
    setItems((prev) => [...prev, item]);
    setSelectedBlockId(item.id);
    if (item.type === 'project') setSelectedProjectId(item.id);
  };
  const addMarkdownBlock = () => addSelectedBlock({ id: newId(), type: 'markdown', markdown: '' });
  const addTableBlock = () =>
    addSelectedBlock({
      id: newId(),
      type: 'table',
      columns: [
        { label: '項目', align: 'left' },
        { label: '内容', align: 'left' },
      ],
      rows: [['', '']],
    });
  const addSkillsBlock = () =>
    addSelectedBlock({ id: newId(), type: 'skills', category: '', skills: [{ name: '', years: 0, level: '' }] });
  const addExperienceBlock = () =>
    addSelectedBlock({
      id: newId(),
      type: 'experience',
      company: '',
      startDate: '',
      endDate: '',
      role: '',
      description: '',
    });
  const updateProjectData = (data: ProjectBlockData) => {
    const targetId = selectedProjectId === 'new-project' ? newProjectBlockIdRef.current : selectedProjectId;
    if (selectedProjectId === 'new-project') {
      setSelectedProjectId(targetId);
      setSelectedBlockId(targetId);
    }
    // 変更履歴は「変更前の状態」と突き合わせてラベルを作るため、更新関数の外で先に取る。
    // setItems の更新関数の中で副作用を起こすと StrictMode の二重呼び出しで履歴が重複する。
    // project ブロックがまだ無い（初回編集）場合は ProjectEditor と同じ空データへ
    // フォールバックする — ensureProjectBlock 廃止後もここが history.ts の初回エントリを
    // 「追加」として記録できる唯一の場所になる。
    const before =
      (items.find((i) => i.id === targetId && i.type === 'project') as { data: ProjectBlockData } | undefined)?.data ??
      ({ companies: [], items: [] } satisfies ProjectBlockData);
    // 参照比較だと ProjectEditor が毎回新しいオブジェクトを渡すため常に真になる。
    // 中身が同じ更新で履歴を増やさないよう、内容で比べる。
    if (JSON.stringify(before) !== JSON.stringify(data)) {
      setHistory(pushHistory(before, data, Date.now(), historyKey));
    }
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === targetId && i.type === 'project');
      if (idx === -1) return [...prev, { id: targetId, type: 'project', data }];
      // 選択した案件ブロックだけを更新する。別の案件ブロックへ複写しない。
      // 全ブロックへ同じ data を複写すると2件目以降の内容が消えるため、
      // 読んでいる先頭ブロックだけを更新する（#353）。
      return prev.map((i, j) => (j === idx && i.type === 'project' ? { ...i, data } : i));
    });
  };

  /** 履歴から復元する。復元自体も 1 件の変更として履歴に残す（戻したことを取り消せるように）。 */
  const restoreProjectData = (snapshot: ProjectBlockData) => {
    updateProjectData(snapshot);
    setHistoryOpen(false);
  };

  const handleCreateSheet = async () => {
    // 作成後の router.push は key={activeSheetId} の再マウントで編集中 state を破棄する。
    // SPA 内遷移では beforeunload が発火しないため、シート切替・閲覧へ導線と同じくここで確認を取る。
    if (!(await confirmDiscardChanges())) return;
    setNewSheetTitle('新しいスキルシート');
    setNewSheetTemplateId(TEMPLATES[0].id);
    setCreateError(null);
    setShowCreateDialog(true);
  };

  const handleConfirmCreate = () => {
    const title = newSheetTitle.trim();
    if (!title || isSheetOp || createInFlightRef.current) return;
    createInFlightRef.current = true;
    setCreateError(null);
    startSheetOp(async () => {
      try {
        const key = JSON.stringify([title, newSheetTemplateId]);
        if (createOperationRef.current?.key !== key) {
          const template = TEMPLATES.find((t) => t.id === newSheetTemplateId);
          createOperationRef.current = {
            key,
            sheetId: newId(),
            title,
            blocks: (template?.blocks ?? []).map((block, order) => ({ ...block, id: newId(), order })),
          };
        }
        const { key: _key, ...operation } = createOperationRef.current;
        const res = await createMutation.mutateAsync(operation);
        if (!mountedRef.current) return;
        await utils.sheet.list.invalidate().catch(() => undefined);
        if (!mountedRef.current) return;
        createOperationRef.current = null;
        setShowCreateDialog(false);
        router.push(`/builder?sheet=${res.sheetId}`);
      } catch {
        if (!mountedRef.current) return;
        setCreateError('シートの作成に失敗しました。');
        toast.error('シートの作成に失敗しました');
      } finally {
        createInFlightRef.current = false;
      }
    });
  };

  const handleDeleteSheet = (sheetId: string, sheetTitle: string) => {
    startSheetOp(async () => {
      try {
        // アクティブシートの削除は実行中の保存と直列化する。保存の飛行中に
        // savedRevisionRef を読むと、保存完了でサーバ側の版が進み CAS が誤 Conflict し、
        // 自分自身の保存を「別セッションの更新競合」と誤診断する（#353）。
        // 待ちは上限付き — 超えたら保存を諦めず完了を促す。
        if (sheetId === activeSheetId) {
          for (let i = 0; i < 100 && saveInFlightRef.current && mountedRef.current; i++) {
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          if (saveInFlightRef.current) {
            toast.error('保存が実行中です。完了後に再度お試しください。');
            return;
          }
        }
        let expectedRevision = savedRevisionRef.current;
        let confirmedTitle = sheetTitle;
        if (sheetId !== activeSheetId) {
          const state = await utils.sheet.builderState.fetch({ sheetId });
          if (state.status !== 'OK') throw new Error('Document unavailable');
          expectedRevision = state.snapshot.revision;
          confirmedTitle = state.snapshot.title;
        }
        if (!mountedRef.current) return;
        if (
          !(await confirm({
            title: `「${confirmedTitle}」を削除しますか？`,
            description: '一覧から削除されます。削除するシートが正しいことを確認してください。',
            confirmLabel: '削除する',
            danger: true,
          }))
        )
          return;
        await deleteMutation.mutateAsync({ sheetId, expectedRevision });
        if (!mountedRef.current) return;
        // 遷移先の決定は削除直前の一覧から即座に算出する（invalidate の再取得完了を待たない）。
        // 一覧の表示自体は invalidate() が引き起こす再取得で追従する。
        const remaining = sheets.filter((s) => s.id !== sheetId);
        await utils.sheet.list.invalidate().catch(() => undefined);
        if (!mountedRef.current) return;
        if (sheetId === activeSheetId) {
          router.push(remaining[0] ? `/builder?sheet=${remaining[0].id}` : '/builder');
        } else {
          router.refresh();
        }
        toast.success('シートを削除しました');
      } catch {
        if (!mountedRef.current) return;
        toast.error('シートの削除に失敗しました。更新競合の場合は内容を確認してから再操作してください。');
      }
    });
  };

  const handleExport = () => {
    // バックアップは閲覧面ではないため hidden な会社・案件も含める
    // （黙って欠落させると、このバックアップからの復元で hidden データが失われる）。
    // 一方で中身が空のブロック（未入力のテンプレスカフォールド等）は assembleMarkdown が
    // 描画時と同じ基準でスキップする。DB 側は空ブロックも保持するので、データそのものは
    // 失われない（このバックアップは markdown 文字列であり、空スカフォールドの復元は保証しない）。
    const content = assembleMarkdown(items, { includeHidden: true, referenceMonth });
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    anchor.download = `skillsheet-backup-${stamp}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    // モバイル/Firefox はダウンロード処理が非同期のため、即時 revoke だと失敗しうる。
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, REVOKE_DELAY_MS);
    toast.success('バックアップを書き出しました');
  };

  const handleSave = async () => {
    if (!mountedRef.current) return false;
    if (loadFailure !== null || !activeSheetId) {
      toast.error('読み込みに失敗したままなので保存できません。ページを再読み込みしてください。');
      return;
    }
    // 自動保存が実行中なら手動保存を開始しない（同じ expectedRevision を持つ 2 リクエストが
    // 競走して片方が誤 Conflict になる自己競合を防ぐ）。ボタンの disabled は次レンダーまで
    // 反映されないため、描画状態ではなく実行中フラグ自体をここで検査する。
    // 実行中に入った編集分は完了後の追撃自動保存が拾う。
    if (saveInFlightRef.current) {
      followUpRef.current = true;
      return;
    }
    if (hasBlockedDraft()) {
      // blockedItemIds は項目名の重複・未入力のどちらでもブロックする（isBlocked 参照）。
      // ここで「重複」と断定すると、原因が未入力の場合に誤った診断になる
      // （chatgpt-codex-connector レビュー指摘）。行単位のエラー表示（ProfileBlockEditor）
      // が実際の原因を示すので、ここでは理由を特定しない案内にとどめる。
      toast.error(
        'プロフィールの項目名を確認してください（重複または未入力があります）。解消してから保存してください。',
      );
      return;
    }
    // データ消失ガード: 全ブロックが空（type 別判定）なら、保存で全内容が消える。
    // 明示的な確認が取れた場合のみ続行する。
    const isAllEmpty = itemsRef.current.every((item) => isBlockInputEmpty(itemToBlockInput(item)));
    if (isAllEmpty) {
      const confirmed = await confirm({
        title: '内容が空です。保存すると、シートの内容がすべて消えます。',
        description: '保存済みの内容は版の履歴に残ります。',
        confirmLabel: '空のまま保存',
        danger: true,
      });
      if (!confirmed) return;
    }

    if (!mountedRef.current || saveInFlightRef.current || hasBlockedDraft()) return false;
    const currentItems = itemsRef.current;
    const currentTitle = titleRef.current;

    const payload = {
      title: currentTitle,
      blocks: itemsToDocumentBlocks(currentItems),
      sheetId: activeSheetId,
      expectedRevision: savedRevisionRef.current,
    };
    if (validateDocumentBlocks(payload.blocks).some((issue) => issue.code === 'PERIOD_PROJECTION_MISMATCH')) {
      toast.error('保存できない入力があります。期間の日付などの診断を確認してください。');
      return;
    }
    const savedSnapshot = snapshot(currentItems, currentTitle);

    return new Promise<boolean>((resolve) =>
      startSaving(async () => {
        let succeeded = false;
        // 手動保存も自動保存と同じ実行中フラグを共有し、同時保存（expectedRevision の
        // 取り違えによる誤 Conflict）を防ぐ。実行中の編集分は追撃自動保存が拾う。
        saveInFlightRef.current = true;
        try {
          const result = await saveWithReadback(payload, saveMutation.mutateAsync, (sheetId) =>
            utils.sheet.builderState.fetch({ sheetId }, { staleTime: 0 }),
          );
          if (!mountedRef.current) return;
          // R01: 次回の競合判定基準にはサーバーが返した版を使う。応答の逆順到着で
          // 版を後退させないよう単調増加を守る（版が欠けた応答では現状維持）。
          if (isRevision(result.revision)) {
            savedRevisionRef.current =
              BigInt(result.revision) > BigInt(savedRevisionRef.current) ? result.revision : savedRevisionRef.current;
          }
          if (savedTitleRef.current !== payload.title) {
            savedTitleRef.current = payload.title;
            void utils.sheet.list.invalidate().catch(() => undefined);
          }
          // 保存成功した内容をスナップショットとして記録し、dirty を解除する
          // （保存中に編集が入っていた場合は dirty のままにする）。
          lastSavedSnapshotRef.current = savedSnapshot;
          setIsDirty(snapshot(itemsRef.current, titleRef.current) !== savedSnapshot);
          setAutosaveStatus('saved');
          setLastSaveKind('manual');
          setSavedAt(new Date());
          setAuthExpired(false);
          autosaveStoppedRef.current = false;
          succeeded = true;
          toast.success('保存しました');
        } catch (err) {
          if (!mountedRef.current) return;
          if (err instanceof TRPCClientError && err.data?.code === 'UNAUTHORIZED') {
            setAuthExpired(true);
            autosaveStoppedRef.current = true;
            followUpRef.current = false;
            toast.error('セッションが切れました。再度認証してください。');
          } else if (err instanceof TRPCClientError && err.data?.code === 'CONFLICT') {
            // 手動保存で競合を検出した場合も自動保存を恒久停止する
            // （直後の自動保存が同じ競合を繰り返し踏むのを防ぐ）。
            autosaveStoppedRef.current = true;
            followUpRef.current = false;
            setAutosaveStatus('conflict');
            const reload = await confirm({
              title: 'このシートはほかの画面で更新されています。',
              description: '最新を読み込むと、この画面でまだ保存していない変更は失われます。自動保存は止めてあります。',
              confirmLabel: '最新を読み込む',
              cancelLabel: 'あとで',
            });
            // router.refresh() はサーバコンポーネントを再取得するだけで、key={activeSheetId} が
            // 変わらない BuilderClient は再マウントされず古いローカル state が残る。
            // 競合インジケータの再読み込みボタンと同じくフルリロードで最新版を反映する。
            if (reload) window.location.reload();
          } else {
            toast.error('保存に失敗しました');
          }
        } finally {
          saveInFlightRef.current = false;
          resolve(succeeded);
        }
        // 手動保存の実行中に編集が続いていた場合の追撃自動保存。
        if (followUpRef.current && !autosaveStoppedRef.current) {
          followUpRef.current = false;
          void runAutosave();
        }
      }).then(
        () => resolve(false),
        () => resolve(false),
      ),
    );
  };

  const openHistoryAfterSave = async () => {
    if (saveInFlightRef.current) {
      toast.error('保存が完了してから版の履歴を開いてください。');
      return;
    }
    if (hasBlockedDraft()) {
      toast.error('未確定の項目名を確認してください。入力はこの画面に保持しています。');
      return;
    }
    if (isDirty) {
      if (
        !(await confirm({
          title: '保存してから版の履歴を開きます。',
          description: 'この画面の変更を保存してから、保存済みの版を比較します。',
          confirmLabel: '保存して履歴を開く',
          cancelLabel: '編集に戻る',
        }))
      )
        return;
      while (snapshot(itemsRef.current, titleRef.current) !== lastSavedSnapshotRef.current) {
        if (!mountedRef.current || hasBlockedDraft()) return;
        const saved = await handleSave();
        if (saved && snapshot(itemsRef.current, titleRef.current) === lastSavedSnapshotRef.current) break;
        if (
          !(await confirm({
            title: '履歴を開く前の保存を完了できませんでした。',
            description: '入力内容はこの画面に保持しています。保存に失敗したか、保存中に追加の編集が入っています。',
            confirmLabel: 'もう一度保存して開く',
            cancelLabel: '編集に戻る',
          }))
        )
          return;
      }
    }
    if (mountedRef.current && !hasBlockedDraft()) setVersionHistoryOpen(true);
  };
  const requestHistoryOpen = async () => {
    if (historyOpeningRef.current) return;
    historyOpeningRef.current = true;
    setHistoryOpening(true);
    try {
      await openHistoryAfterSave();
    } finally {
      historyOpeningRef.current = false;
      if (mountedRef.current) setHistoryOpening(false);
    }
  };
  // トップバーの自動保存インジケータ表示（競合 > 保存中 > 失敗 > 未保存 > 保存済みの優先順。
  // 初期状態（未編集・未保存）は何も表示しない）。
  const autosaveIndicator =
    autosaveStatus === 'conflict'
      ? { label: '競合 — 再読み込みが必要', dotClass: 'bg-destructive', textClass: 'text-destructive' }
      : blockingCount > 0
        ? {
            // 重複・未入力のどちらでもブロックされるため「重複」と断定しない
            // （chatgpt-codex-connector レビュー指摘）。実際の原因は行単位のエラー表示で示す。
            label:
              blockedProfileIds.length > 0
                ? '項目名を確認してください（重複/未入力）— 保存できません'
                : '期間を確認してください — 保存を止めています',
            dotClass: 'bg-destructive',
            textClass: 'text-destructive',
          }
        : isSaving || autosaveStatus === 'saving'
          ? { label: '保存中…', dotClass: 'bg-[#d4a017]', textClass: 'text-faint' }
          : autosaveStatus === 'error'
            ? {
                label: '自動保存に失敗 — 保存ボタンで再試行',
                dotClass: 'bg-destructive',
                textClass: 'text-destructive',
              }
            : autosaveStatus === 'invalid'
              ? {
                  // バリデーション起因: 手動保存も同じ検証で止まるので再試行は案内しない（#353）
                  label: '入力内容を確認してください — 保存できません',
                  dotClass: 'bg-destructive',
                  textClass: 'text-destructive',
                }
              : isDirty
                ? { label: '未保存の変更', dotClass: 'bg-[#d4a017]', textClass: 'text-faint' }
                : autosaveStatus === 'saved'
                  ? {
                      label:
                        lastSaveKind === 'auto'
                          ? '保存済み（自動）'
                          : lastSaveKind === 'restore'
                            ? '復元済み'
                            : '保存済み',
                      dotClass: 'bg-accent-text',
                      textClass: 'text-faint',
                    }
                  : null;

  return (
    <div className="min-h-screen">
      {confirmationDialog}
      {inputIssueCount > 0 && !versionHistoryOpen && loadFailure === null && (
        <div
          role="status"
          data-testid="input-issues"
          className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 ${blockingCount > 0 ? 'border-danger bg-danger-soft text-danger' : 'border-warn-strong bg-warn-soft text-warn-strong'}`}
        >
          <span className="text-sm">
            {blockingCount > 0
              ? `保存を止めています：${blockingCount}か所。プロフィールの項目名や期間の日付を確認してください。${warningCount > 0 ? `ほかに確認が必要な入力が${warningCount}か所あります。` : ''}`
              : `入力を確認してください：${warningCount}か所。保存は続けています。`}
          </span>
          <Button
            variant="outline"
            onClick={() => {
              const first = blockingPeriodWarnings[0] ?? warnings[0];
              const profileId = blockedProfileIds[0];
              if (
                profileId &&
                (blockingPeriodWarnings.length === 0 ||
                  items.findIndex((item) => item.id === profileId) <
                    items.findIndex((item) => item.id === first.blockId))
              ) {
                setWarningJump(undefined);
                setSelectedBlockId(profileId);
                setProfileWarningJump({
                  blockId: profileId,
                  token: ++warningJumpSequenceRef.current,
                  selector: 'input[aria-invalid="true"]',
                });
                return;
              }
              setProfileWarningJump(undefined);
              setSelectedBlockId(first.blockId);
              setSelectedProjectId(first.blockId);
              setWarningJump({ ...first, token: ++warningJumpSequenceRef.current });
            }}
          >
            最初の確認箇所へ
          </Button>
        </div>
      )}
      {deletedBlock && !versionHistoryOpen && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-2 text-card-foreground"
        >
          <span className="text-sm">ブロックを削除しました</span>
          <Button variant="outline" onClick={undoDeleteBlock}>
            削除を取り消す
          </Button>
        </div>
      )}
      {authExpired && (
        <section role="alert" className="border-b border-border bg-card px-4 py-3 text-foreground">
          <h2 className="font-semibold">認証の有効期限が切れました</h2>
          <p className="text-sm text-muted-foreground">
            入力内容はこの画面に保持しています。別のタブで認証し、この画面に戻って保存してください。自動保存は止めてあります。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href="/login?next=%2Fbuilder"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm font-semibold"
            >
              別のタブで認証する
            </a>
            <Button variant="outline" disabled={isSaving || versionHistoryOpen} onClick={handleSave}>
              認証後に保存を再試行
            </Button>
          </div>
        </section>
      )}
      {showCreateDialog && (
        <CreateSheetDialog
          title={newSheetTitle}
          templateId={newSheetTemplateId}
          busy={isSheetOp}
          error={createError}
          onTitleChange={setNewSheetTitle}
          onTemplateChange={setNewSheetTemplateId}
          onClose={() => setShowCreateDialog(false)}
          onCreate={handleConfirmCreate}
        />
      )}
      {/* data-slot: 案件エディタが左右ペインを固定する基準にこの高さを実測で使う。 */}
      {!versionHistoryOpen && (
        <WorkspaceTopbar
          sheets={sheets}
          activeSheetId={activeSheetId}
          title={title}
          disabled={loadFailure !== null || !activeSheetId}
          busy={isSheetOp}
          saving={isSaving}
          saveBusy={isSaving || autosaveStatus === 'saving'}
          dark={mode === 'dark'}
          showPreview={showProjectPreview}
          previewAvailable
          onSelectSheet={async (id) => {
            if (id !== activeSheetId && (await confirmDiscardChanges())) router.push(`/builder?sheet=${id}`);
          }}
          onCreateSheet={handleCreateSheet}
          onDeleteSheet={handleDeleteSheet}
          onExport={handleExport}
          onHistory={() => setHistoryOpen(true)}
          onVersionHistory={activeSheetId ? requestHistoryOpen : undefined}
          onToggleTheme={toggleTheme}
          onTogglePreview={() => setShowProjectPreview((value) => !value)}
          onOpenPreview={handleOpenPreview}
          onSave={handleSave}
          onView={async () => {
            if (await confirmDiscardChanges()) router.push('/');
            return false;
          }}
          status={
            autosaveIndicator && (
              <span
                data-slot="autosave-indicator"
                role="status"
                className={`inline-flex min-w-0 flex-wrap items-center gap-1.5 font-mono text-xs ${autosaveIndicator.textClass}`}
              >
                <span aria-hidden className={`size-[7px] shrink-0 rounded-full ${autosaveIndicator.dotClass}`} />
                <span>{autosaveIndicator.label}</span>
                {savedAt && !isDirty && autosaveStatus !== 'saving' && (
                  <time dateTime={savedAt.toISOString()} title="この画面で保存完了を確認した時刻">
                    {savedAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </time>
                )}
                {autosaveStatus === 'conflict' && (
                  <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                    再読み込み
                  </Button>
                )}
              </span>
            )
          }
        />
      )}

      {!versionHistoryOpen && (!activeSheetId || loadFailure !== null) && (
        <WorkspaceState
          empty={!loadFailure || loadFailure === 'not-found'}
          title={
            loadFailure === 'uneditable'
              ? '未対応の項目があるため、編集を止めています。'
              : loadFailure === 'invalid-state'
                ? '既定シートの状態が不整合です。'
                : loadFailure === 'not-found'
                  ? '指定したシートが見つかりません。'
                  : loadFailure
                    ? '保存済みのシートを読み込めませんでした。'
                    : 'シートはまだありません。'
          }
          description={
            loadFailure === 'uneditable'
              ? '原文はそのまま残っています。編集できる版に戻すか、原文を退避してから直してください。'
              : loadFailure === 'invalid-state'
                ? '復旧が完了するまで編集できません。内容は残っています。'
                : loadFailure === 'not-found'
                  ? '開くシートを一覧から選び直してください。'
                  : loadFailure === 'config'
                    ? 'サーバーの設定が終わっていない可能性があります。既存の内容を上書きしないよう、保存は止めてあります。'
                    : loadFailure
                      ? '既存の内容を上書きしないよう、保存は止めてあります。ページを再読み込みしてください。'
                      : 'テンプレートを選んで、最初のシートを作りましょう。'
          }
        >
          {loadFailure === 'uneditable' && rawSnapshot && (
            <>
              <ul aria-label="未対応の項目" className="space-y-2 rounded border border-border p-3 text-sm">
                {rawSnapshot.validation.issues.map((issue) => (
                  <li key={`${issue.blockId}-${issue.path}-${issue.code}`} className="break-all">
                    {issue.blockId}: {issue.path} ({issue.code})
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setVersionHistoryOpen(true)}>版の履歴を開く</Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(rawSnapshot, null, 2)], { type: 'application/json' }),
                    );
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'skillsheet-original.json';
                    link.click();
                    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
                  }}
                >
                  原文JSONを退避
                </Button>
              </div>
            </>
          )}
          {(!loadFailure || loadFailure === 'not-found') && (
            <>
              <div className="grid gap-2">
                {loadFailure === 'not-found' &&
                  sheets.map((sheet) => (
                    <Button
                      key={sheet.id}
                      variant="outline"
                      className="h-auto min-h-11 justify-start whitespace-normal text-left"
                      onClick={() => router.push(`/builder?sheet=${sheet.id}`)}
                    >
                      {sheet.title}
                    </Button>
                  ))}
              </div>
              <Button onClick={handleCreateSheet}>新しいシートを作る</Button>
            </>
          )}
          {loadFailure && loadFailure !== 'not-found' && loadFailure !== 'uneditable' && (
            <Button onClick={() => window.location.reload()}>再読み込み</Button>
          )}
        </WorkspaceState>
      )}
      {versionHistoryOpen && (
        <VersionHistory
          title={title}
          currentRevision={savedRevisionRef.current}
          currentEditable={loadFailure === null}
          referenceMonth={referenceMonth}
          restoreBlockedReason={
            isDirty || blockedItemIds.size > 0 || saveInFlightRef.current
              ? '未保存の入力があります。履歴を閉じ、保存してから復元してください。'
              : undefined
          }
          api={{
            list: (beforeRevision) =>
              utils.sheet.history.list.fetch(
                { sheetId: activeSheetId, ...(beforeRevision ? { beforeRevision } : {}) },
                { staleTime: 0 },
              ),
            read: (revision) => utils.sheet.history.read.fetch({ sheetId: activeSheetId, revision }, { staleTime: 0 }),
            previewRestore: (targetRevision, expectedRevision) =>
              utils.sheet.history.previewRestore.fetch(
                { sheetId: activeSheetId, targetRevision, expectedRevision },
                { staleTime: 0 },
              ),
            restore: (input) => restoreVersionMutation.mutateAsync({ sheetId: activeSheetId, ...input }),
          }}
          onClose={() => setVersionHistoryOpen(false)}
          onReload={() => window.location.reload()}
          onRestored={(result: RestoreResult) => {
            const restored = result.snapshot.blocks.map((block) => blockToItem(block as Block));
            setItems(restored);
            setWarningJump(undefined);
            setProfileWarningJump(undefined);
            setDeletedBlock(null);
            itemsRef.current = restored;
            setTitle(result.snapshot.title);
            titleRef.current = result.snapshot.title;
            savedTitleRef.current = result.snapshot.title;
            savedRevisionRef.current = result.snapshot.revision;
            lastSavedSnapshotRef.current = snapshot(restored, result.snapshot.title);
            setIsDirty(false);
            failedSnapshotRef.current = null;
            followUpRef.current = false;
            autosaveStoppedRef.current = false;
            setAuthExpired(false);
            setAutosaveStatus('saved');
            setLastSaveKind('restore');
            setSavedAt(new Date());
            setLoadFailure(null);
            setBlockedItemIds(new Set());
            profileCustomDraftsRef.current.clear();
            setSelectedBlockId(restored[0]?.id ?? 'new-project');
            setSelectedProjectId(restored.find((item) => item.type === 'project')?.id ?? 'new-project');
            void utils.sheet.list.invalidate().catch(() => undefined);
          }}
        />
      )}
      {historyOpen && (
        <HistoryDrawer
          legacyEntries={loadHistory(activeSheetId)}
          entries={history}
          onClose={() => setHistoryOpen(false)}
          onRestore={restoreProjectData}
        />
      )}
      {!versionHistoryOpen &&
        Boolean(activeSheetId) &&
        loadFailure === null &&
        (() => {
          const projectItem = items.find(
            (item) => item.type === 'project' && (item.id === selectedProjectId || selectedProjectId === 'new-project'),
          ) as Extract<EditorItem, { type: 'project' }> | undefined;
          const selectedItem = items.find((item) => item.id === selectedBlockId);
          const projectMode = selectedBlockId === selectedProjectId || selectedItem?.type === 'project';
          const projectIndex = projectItem ? items.indexOf(projectItem) : items.length - 1;
          const names = {
            markdown: 'テキスト',
            table: 'テーブル',
            skills: 'スキル',
            experience: '職務経歴（簡易）',
            profile: 'プロフィール',
            stats: '統計',
            project: '経歴（案件）',
          };
          const outlineItems = items.map((item, index) => ({
            id: item.id,
            canMoveUp: index > 0,
            canMoveDown: index < items.length - 1,
            kind: names[item.type],
            warningCount: warnings.filter((warning) => warning.blockId === item.id).length,
            blockingCount:
              blockingPeriodWarnings.filter((warning) => warning.blockId === item.id).length +
              (blockedProfileIds.includes(item.id) ? 1 : 0),
            title:
              item.type === 'skills'
                ? item.category || '分類未入力'
                : item.type === 'markdown'
                  ? item.markdown.split('\n')[0] || 'テキスト'
                  : names[item.type],
          }));
          const selectBlock = (id: string) => {
            setWarningJump(undefined);
            setProfileWarningJump(undefined);
            setSelectedBlockId(id);
            if (items.find((item) => item.id === id)?.type === 'project') setSelectedProjectId(id);
          };
          const outline = (entries: typeof outlineItems, compact = false) => (
            <WorkspaceOutline
              items={entries}
              selectedId={selectedBlockId}
              onSelect={selectBlock}
              onMove={(id, direction) => moveBlock(id, direction === 'up' ? -1 : 1)}
              compact={compact}
            />
          );
          return (
            <DndContext
              sensors={sensors}
              collisionDetection={(args) => {
                if (!args.pointerCoordinates) return closestCenter(args);
                const hits = pointerWithin(args);
                const outlineHits = hits.filter(
                  (hit) => args.droppableContainers.find((container) => container.id === hit.id)?.data.current?.blockId,
                );
                return outlineHits.length ? outlineHits : hits;
              }}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                <CanvasDroppable>
                  <ProjectEditor
                    key={projectItem?.id ?? newProjectBlockIdRef.current}
                    data={projectItem?.data ?? { companies: [], items: [] }}
                    onChange={updateProjectData}
                    showPreview={showProjectPreview}
                    workspace={{
                      selectedBlockId,
                      warningJump: warningJump?.blockId === selectedBlockId ? warningJump : undefined,
                      editorFocusRequest:
                        profileWarningJump?.blockId === selectedBlockId ? profileWarningJump : undefined,
                      title,
                      outlineBefore: (
                        <>
                          <div className="border-b border-border p-3">
                            <label
                              htmlFor="sheet-title"
                              className="mb-1 block text-xs font-semibold text-muted-foreground"
                            >
                              シートのタイトル
                            </label>
                            <input
                              id="sheet-title"
                              aria-label="タイトル"
                              value={title}
                              onChange={(event) => setTitle(event.target.value)}
                              className="min-h-11 w-full rounded border border-input bg-background px-2 text-sm"
                            />
                          </div>
                          {outline(outlineItems.slice(0, projectIndex + 1))}
                        </>
                      ),
                      outlineAfter: outline(outlineItems.slice(projectIndex + 1)),
                      rail: outline(outlineItems, true),
                      outlineFooter: (
                        <BlockAddMenu>
                          <div className="grid gap-1">
                            <Button
                              variant="ghost"
                              onClick={() =>
                                addSelectedBlock({
                                  id: newId(),
                                  type: 'profile',
                                  name: '',
                                  title: '',
                                  pr: '',
                                  strengths: [],
                                  meta: {},
                                })
                              }
                            >
                              プロフィール
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => addSelectedBlock({ id: newId(), type: 'stats', data: { items: [] } })}
                            >
                              統計
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() =>
                                addSelectedBlock({ id: newId(), type: 'project', data: { companies: [], items: [] } })
                              }
                            >
                              案件
                            </Button>
                            <Button variant="ghost" onClick={addMarkdownBlock}>
                              テキスト
                            </Button>
                            <Button variant="ghost" onClick={addTableBlock}>
                              テーブル
                            </Button>
                            <Button variant="ghost" onClick={addSkillsBlock}>
                              スキル一覧
                            </Button>
                            <Button variant="ghost" onClick={addExperienceBlock}>
                              職務経歴（簡易）
                            </Button>
                          </div>
                          <div className="border-t border-border pt-2">
                            {PALETTE_ITEMS.map((entry) => (
                              <PaletteChip key={entry.blockType} {...entry} />
                            ))}
                          </div>
                        </BlockAddMenu>
                      ),
                      onProjectSelect: () => setSelectedBlockId(projectItem?.id ?? selectedProjectId),
                      ...(projectMode
                        ? {}
                        : {
                            editor: selectedItem ? (
                              <SortableBlock
                                key={selectedItem.id}
                                item={selectedItem}
                                onMarkdownChange={updateMarkdown}
                                onTableChange={updateTable}
                                onSkillsChange={updateSkills}
                                onStatsChange={updateStats}
                                onExperienceChange={updateExperience}
                                onProfileChange={updateProfile}
                                onProfileValidityChange={handleProfileValidityChange}
                                customDraft={getProfileCustomDraft(selectedItem.id)}
                                onCustomDraftChange={(rows) => setProfileCustomDraft(selectedItem.id, rows)}
                                onDelete={deleteBlock}
                                onMoveBlock={moveBlock}
                              />
                            ) : (
                              <p className="p-6">目次からブロックを選んでください。</p>
                            ),
                            preview: selectedItem ? (
                              <WorkspaceBlockPreview
                                items={items}
                                item={selectedItem}
                                referenceMonth={referenceMonth}
                              />
                            ) : (
                              <p className="p-6">プレビューするブロックがありません。</p>
                            ),
                          }),
                    }}
                  />
                </CanvasDroppable>
              </SortableContext>
              <DragOverlay>{activePaletteType && <DragPreview blockType={activePaletteType} />}</DragOverlay>
            </DndContext>
          );
        })()}
    </div>
  );
};

export default BuilderClient;
