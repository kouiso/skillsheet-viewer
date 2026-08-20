'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
// 型・純関数はサーバ専用モジュール（neon ドライバ等）を client バンドルに巻き込まないため、
// root の @skillsheet/db ではなく純粋サブエクスポート @skillsheet/db/blocks から import する
// （詳細は serialize.ts の同趣旨コメント）。
import {
  type Block,
  type ExperienceBlockData,
  isBlockInputEmpty,
  type ProfileBlockData,
  type ProjectBlockData,
  type SkillEntry,
  type TableColumn,
} from '@skillsheet/db/blocks';
import { TRPCClientError } from '@trpc/client';
import { Download, Eye, FileText, Moon, Plus, Save, Sun, Table, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useThemeMode } from '@/context/theme-context';
import { trpc } from '@/lib/trpc-client';

import type { CustomMetaRow } from './block-editors/profile-block-editor';
import { CanvasDroppable } from './canvas/canvas-droppable';
import { createPaletteItem, DragPreview, PALETTE_ITEMS, type PaletteBlockType, PaletteChip } from './canvas/palette';
import { SortableBlock } from './canvas/sortable-block';
import { type HistoryEntry, loadHistory, pushHistory } from './history';
import { HistoryDrawer } from './history-drawer';
import { ProjectEditor, type ProjectEditorSelection } from './project-editor';
import { assembleMarkdown, blockToItem, type EditorItem, itemToBlockInput, newId, snapshot } from './serialize';
import { TEMPLATES } from './templates';

// 分割前（builder-client.tsx 1 枚だった頃）と同じ import 元を保つための再エクスポート。
// 実体は serialize.ts にある。既存の import 元（テスト等）を書き換えずに済ませる。
export type { EditorItem };
export { assembleMarkdown, blockToItem };

type SheetSummary = { id: string; title: string; updatedAt: Date };

const REVOKE_DELAY_MS = 100;
const PREVIEW_DEBOUNCE_MS = 300;
// 別ウィンドウプレビューとの連携キー。apps/web/app/builder/preview/preview-client.tsx と共有。
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
type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';

interface BuilderClientProps {
  initialBlocks: Block[];
  initialTitle: string;
  sheets: SheetSummary[];
  activeSheetId: string;
  /**
   * サーバ側でシートを読めなかったときの理由。
   * null なら正常（＝空なら本当にまだ何も無い）。
   * 以前はここを渡しておらず、読み込み失敗でも空の編集画面が出るだけだったため、
   * 利用者は「保存したものが消えた」と誤解した。
   */
  loadFailure?: 'config' | 'unknown' | null;
}

const BuilderClient = ({
  initialBlocks,
  initialTitle,
  sheets: initialSheets,
  activeSheetId,
  loadFailure = null,
}: BuilderClientProps) => {
  const router = useRouter();
  const { mode, toggleTheme } = useThemeMode();
  const [items, setItems] = useState<EditorItem[]>(() => initialBlocks.map(blockToItem));
  // 案件エディタの選択中会社/案件（トップバー breadcrumb 表示用）
  const [projectCrumb, setProjectCrumb] = useState<ProjectEditorSelection | null>(null);
  const handleProjectSelectionChange = useCallback((selection: ProjectEditorSelection | null) => {
    setProjectCrumb(selection);
  }, []);
  // 案件エディタの右ペイン（ライブプレビュー）の表示。トップバーから切り替える。
  const [showProjectPreview, setShowProjectPreview] = useState(true);
  // 案件エディタの変更履歴（localStorage 保存・このブラウザ限定）
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  // localStorage はサーバ側に無いため、マウント後に読む（SSR とマークアップを食い違わせない）
  useEffect(() => {
    setHistory(loadHistory(activeSheetId));
  }, [activeSheetId]);
  const [title, setTitle] = useState(initialTitle);
  const [isSaving, startSaving] = useTransition();
  const [isSheetOp, startSheetOp] = useTransition();
  // 認可・入力検証・エラーコードを tRPC procedure 側に集約したので、ここでは
  // mutateAsync を素の非同期関数として呼び、既存の直列化ロジック（saveInFlightRef 等）は変えない。
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
  const [newSheetTitle, setNewSheetTitle] = useState('新しいスキルシート');
  // A3 並行保存ガード: 編集開始時（またはシート切替時）の updatedAt を保持する。
  // 保存成功時は new Date() で更新し、次回保存時の基準にする。
  // RSC からのプロップ（initialSheets）は unstable_cache のキャッシュ命中時に Date が
  // ISO 文字列へ壊れることがある（unstable_cache は内部で JSON.stringify/JSON.parse を
  // 通すため。next/dist/server/web/spec-extension/unstable-cache.js の cacheNewResult
  // 参照）。expectedUpdatedAt は z.date() で厳密に Date のみを受けるため、ここで明示的に
  // Date へ正規化しておかないと、既存シートを開いて保存するたびに autosave/手動保存が
  // BAD_REQUEST として恒常的に失敗する（headless E2E の autosave.spec.ts で再現・確認済み。
  // 新規作成直後のシートは expectedUpdatedAt が undefined のためこの経路を通らず、
  // 症状が「既存シートを開いた場合のみ」に見えていた）。
  const initialSavedUpdatedAt = initialSheets.find((s) => s.id === activeSheetId)?.updatedAt;
  const savedUpdatedAtRef = useRef<Date | undefined>(
    initialSavedUpdatedAt ? new Date(initialSavedUpdatedAt) : undefined,
  );
  const [newSheetTemplateId, setNewSheetTemplateId] = useState(TEMPLATES[0].id);
  const savedRef = useRef(false);
  // サイドバーの sheet.list は staleTime: 60s の間 initialData を再利用し続けるため、
  // タイトルを変更して保存しても react-query 側は自動では気づかない。保存成功時に
  // タイトルが変わっていた場合だけ invalidate してサイドバー表示を追従させる
  // （毎回 invalidate すると自動保存のたびに一覧を再取得してしまい staleTime の意味が薄れる）。
  const savedTitleRef = useRef(initialTitle);
  const [activePaletteType, setActivePaletteType] = useState<PaletteBlockType | null>(null);
  const [activeTab, setActiveTab] = useState<'blocks' | 'project'>('blocks');

  // 未保存変更の検知。最後に保存成功した時点のスナップショット（タイトル＋構造化ブロック）を
  // 保持し、現在の内容と差分があれば dirty とみなす（保存成功で更新）。
  const lastSavedSnapshotRef = useRef<string>(snapshot(initialBlocks.map(blockToItem), initialTitle));
  const [isDirty, setIsDirty] = useState(false);

  // SPA 内遷移（シート切替・閲覧へ等）は beforeunload が発火せず、key={activeSheetId} の
  // 再マウントで編集中 state が黙って破棄されるため、dirty 時は明示的に確認を取る。
  const confirmDiscardChanges = () =>
    !isDirty || window.confirm('未保存の変更があります。このまま移動すると変更は失われます。移動しますか？');

  // --- 自動保存（Phase 3） ---
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  // 競合検出後は自動保存を恒久停止する（競合スパム防止）。state と別に ref でも持ち、
  // 非同期コールバック内から最新値を同期参照できるようにする。
  // 読み込みに失敗したまま保存すると、sheetId が空のまま既定シートへ書き込まれ、
  // 読めなかっただけの既存内容を「いま画面にある空同然の内容」で上書きしてしまう。
  // 失敗が出ている間は自動保存も手動保存も行わない（再読み込みで復帰させる）。
  const autosaveStoppedRef = useRef(loadFailure !== null);
  // 保存実行中フラグ（自動/手動で共有）。実行中に再度 dirty になった場合は
  // followUpRef を立て、完了後にちょうど 1 回だけ追撃保存する。
  const saveInFlightRef = useRef(false);
  const followUpRef = useRef(false);
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
    setBlockedItemIds((prev) => {
      const has = prev.has(id);
      if (hasConflict === has) return prev;
      const next = new Set(prev);
      if (hasConflict) next.add(id);
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

  const moveBlock = useCallback((id: string, direction: -1 | 1) => {
    setItems((prev) => {
      const index = prev.findIndex((i) => i.id === id);
      if (index === -1) return prev;
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      return arrayMove(prev, index, target);
    });
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // プレビューは重い（Markdown パース＋ハイライト）ため、入力のたびではなく
  // デバウンスして更新し、タイピングのラグを防ぐ。初期値・初回レンダリングは即時反映。
  const [previewContent, setPreviewContent] = useState(() => assembleMarkdown(items));
  const isFirstPreviewRender = useRef(true);

  useEffect(() => {
    // useState の初期値で既に assembleMarkdown(items) 評価済みのため、
    // マウント直後の再計算は不要（重い Markdown パース処理の二重実行を避ける）。
    if (isFirstPreviewRender.current) {
      isFirstPreviewRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setPreviewContent(assembleMarkdown(items));
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [items]);

  // 別ウィンドウプレビューへ変更をリアルタイム反映する BroadcastChannel。
  // 別窓が開いていなくても postMessage は無害なので購読側の有無は気にしない。
  const previewChannelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(PREVIEW_CHANNEL_NAME);
    previewChannelRef.current = channel;
    return () => {
      channel.close();
      previewChannelRef.current = null;
    };
  }, []);

  useEffect(() => {
    previewChannelRef.current?.postMessage({ title, content: previewContent });
  }, [title, previewContent]);

  // 生存確認の定期送信。編集の手が止まっている間も別窓が「同期が途切れた」と誤判定しないよう、
  // 内容が変わらなくても一定間隔で同じ内容を送り直す。受信側は最終受信時刻だけを見る。
  useEffect(() => {
    const timer = window.setInterval(() => {
      previewChannelRef.current?.postMessage({ title, content: previewContent });
    }, PREVIEW_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [title, previewContent]);

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
      localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify({ title, content: previewContent }));
    } catch {
      // プライベートブラウジング等で localStorage が使えなくても window.open は試みる。
    }
    const win = window.open('/builder/preview', 'builder-preview', 'width=800,height=1000');
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
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // 一部ブラウザは returnValue の設定でネイティブ確認を表示する。
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // 自動保存の本体。デバウンス満了時と追撃保存時に呼ばれる。
  // 保存が既に実行中なら追撃を予約して戻り、完了後にちょうど 1 回だけ再実行する。
  const runAutosave = useCallback(async () => {
    if (autosaveStoppedRef.current) return;
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
      const result = await saveMutation.mutateAsync({
        title: currentTitle,
        blocks: currentItems.map(itemToBlockInput),
        sheetId: activeSheetId || undefined,
        expectedUpdatedAt: savedUpdatedAtRef.current,
      });
      savedRef.current = true;
      // superjson transformer が Date を server caller / HTTP の両経路で保つため型どおり
      // Date が返るが、念のため new Date() で正規化する（.getTime() 比較の破綻防止）。
      savedUpdatedAtRef.current = new Date(result.updatedAt);
      if (savedTitleRef.current !== currentTitle) {
        savedTitleRef.current = currentTitle;
        void utils.sheet.list.invalidate();
      }
      lastSavedSnapshotRef.current = savedSnapshot;
      failedSnapshotRef.current = null;
      // 保存中に入った編集分が残っていれば dirty のまま（追撃保存が拾う）。
      setIsDirty(snapshot(itemsRef.current, titleRef.current) !== savedSnapshot);
      setAutosaveStatus('saved');
    } catch (err) {
      if (err instanceof TRPCClientError && err.data?.code === 'CONFLICT') {
        // 競合は最初の 1 回で自動保存を恒久停止する（ダイアログは出さず、
        // トップバーのインジケータ＋再読み込みボタンで通知する）。
        autosaveStoppedRef.current = true;
        followUpRef.current = false;
        setAutosaveStatus('conflict');
      } else {
        // 失敗（unauthorized・ネットワークエラー等）は dirty のまま error にする。失敗した
        // スナップショットを記録し、同一内容での自動リトライは行わない
        // （新しい編集が入ったときだけ再試行）。
        failedSnapshotRef.current = savedSnapshot;
        setAutosaveStatus('error');
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
  }, [activeSheetId, saveMutation.mutateAsync, utils.sheet.list.invalidate]);

  // dirty になってから AUTOSAVE_DEBOUNCE_MS 編集が止んだら自動保存する
  // （items/title が変わるたびにタイマーを引き直す＝デバウンス）。
  useEffect(() => {
    if (!isDirty || autosaveStatus === 'conflict' || blockedItemIds.size > 0) return;
    // 失敗直後の status 遷移（saving → error）だけでタイマーを再armしない。
    // 失敗時と同一内容のままなら再試行せず、新しい編集で snapshot が変わったときだけ再デバウンスする。
    if (autosaveStatus === 'error' && snapshot(items, title) === failedSnapshotRef.current) return;
    const timer = setTimeout(() => {
      void runAutosave();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [items, title, isDirty, autosaveStatus, runAutosave, blockedItemIds]);

  const handleDragStart = (event: DragStartEvent) => {
    const blockType = event.active.data.current?.blockType as PaletteBlockType | undefined;
    setActivePaletteType(blockType ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActivePaletteType(null);

    // パレットからのドロップ: over が既存ブロックなら直後に、canvas なら末尾に挿入
    if (active.data.current?.fromPalette) {
      const blockType = active.data.current.blockType as PaletteBlockType;
      const newItem = createPaletteItem(blockType);
      setItems((prev) => {
        if (!over || over.id === 'canvas-drop') return [...prev, newItem];
        const idx = prev.findIndex((i) => i.id === over.id);
        if (idx === -1) return [...prev, newItem];
        const next = [...prev];
        next.splice(idx + 1, 0, newItem);
        return next;
      });
      return;
    }

    // 既存ブロックの並べ替え
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id);
      const newIndex = prev.findIndex((i) => i.id === over.id);
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

  const updateProfile = (id: string, data: ProfileBlockData) =>
    setItems((prev) => prev.map((i) => (i.id === id && i.type === 'profile' ? { ...i, ...data } : i)));

  const deleteBlock = (id: string) => {
    profileCustomDraftsRef.current.delete(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const addMarkdownBlock = () => setItems((prev) => [...prev, { id: newId(), type: 'markdown', markdown: '' }]);

  // 既定テーブルは 2 列（項目/内容）＋空 1 行。
  const addTableBlock = () =>
    setItems((prev) => [
      ...prev,
      {
        id: newId(),
        type: 'table',
        columns: [
          { label: '項目', align: 'left' },
          { label: '内容', align: 'left' },
        ],
        rows: [['', '']],
      },
    ]);

  // 既定スキル一覧は空エントリ 1 行。
  const addSkillsBlock = () =>
    setItems((prev) => [
      ...prev,
      { id: newId(), type: 'skills', category: '', skills: [{ name: '', years: 0, level: '' }] },
    ]);

  const addExperienceBlock = () =>
    setItems((prev) => [
      ...prev,
      { id: newId(), type: 'experience', company: '', startDate: '', endDate: '', role: '', description: '' },
    ]);

  const updateProjectData = (data: ProjectBlockData) => {
    // 変更履歴は「変更前の状態」と突き合わせてラベルを作るため、更新関数の外で先に取る。
    // setItems の更新関数の中で副作用を起こすと StrictMode の二重呼び出しで履歴が重複する。
    // project ブロックがまだ無い（初回編集）場合は ProjectEditor と同じ空データへ
    // フォールバックする — ensureProjectBlock 廃止後もここが history.ts の初回エントリを
    // 「追加」として記録できる唯一の場所になる。
    const before =
      (items.find((i) => i.type === 'project') as { data: ProjectBlockData } | undefined)?.data ??
      ({ companies: [], items: [] } satisfies ProjectBlockData);
    // 参照比較だと ProjectEditor が毎回新しいオブジェクトを渡すため常に真になる。
    // 中身が同じ更新で履歴を増やさないよう、内容で比べる。
    if (JSON.stringify(before) !== JSON.stringify(data)) {
      setHistory(pushHistory(before, data, Date.now(), activeSheetId));
    }
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.type === 'project');
      if (idx === -1) return [...prev, { id: newId(), type: 'project', data }];
      return prev.map((i) => (i.type === 'project' ? { ...i, data } : i));
    });
  };

  /** 履歴から復元する。復元自体も 1 件の変更として履歴に残す（戻したことを取り消せるように）。 */
  const restoreProjectData = (snapshot: ProjectBlockData) => {
    updateProjectData(snapshot);
    setHistoryOpen(false);
  };

  const handleCreateSheet = () => {
    // 作成後の router.push は key={activeSheetId} の再マウントで編集中 state を破棄する。
    // SPA 内遷移では beforeunload が発火しないため、シート切替・閲覧へ導線と同じくここで確認を取る。
    if (!confirmDiscardChanges()) return;
    setNewSheetTitle('新しいスキルシート');
    setNewSheetTemplateId(TEMPLATES[0].id);
    setShowCreateDialog(true);
  };

  const handleConfirmCreate = () => {
    const title = newSheetTitle.trim();
    if (!title) return;
    setShowCreateDialog(false);
    startSheetOp(async () => {
      try {
        const res = await createMutation.mutateAsync({ title, templateId: newSheetTemplateId });
        await utils.sheet.list.invalidate();
        router.push(`/builder?sheet=${res.sheetId}`);
      } catch {
        toast.error('シートの作成に失敗しました');
      }
    });
  };

  const handleDeleteSheet = (sheetId: string, sheetTitle: string) => {
    if (sheets.length <= 1) {
      toast.error('最後のシートは削除できません');
      return;
    }
    if (!window.confirm(`「${sheetTitle}」を削除しますか？この操作は元に戻せません。`)) return;
    startSheetOp(async () => {
      try {
        await deleteMutation.mutateAsync({ sheetId });
        // 遷移先の決定は削除直前の一覧から即座に算出する（invalidate の再取得完了を待たない）。
        // 一覧の表示自体は invalidate() が引き起こす再取得で追従する。
        const remaining = sheets.filter((s) => s.id !== sheetId);
        await utils.sheet.list.invalidate();
        if (sheetId === activeSheetId) {
          router.push(`/builder?sheet=${remaining[0]?.id ?? ''}`);
        } else {
          router.refresh();
        }
        toast.success('シートを削除しました');
      } catch {
        toast.error('シートの削除に失敗しました');
      }
    });
  };

  const handleExport = () => {
    // バックアップは閲覧面ではないため hidden な会社・案件も含める
    // （黙って欠落させると、このバックアップからの復元で hidden データが失われる）。
    // 一方で中身が空のブロック（未入力のテンプレスカフォールド等）は assembleMarkdown が
    // 描画時と同じ基準でスキップする。DB 側は空ブロックも保持するので、データそのものは
    // 失われない（このバックアップは markdown 文字列であり、空スカフォールドの復元は保証しない）。
    const content = assembleMarkdown(items, { includeHidden: true });
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

  const handleSave = () => {
    if (loadFailure !== null) {
      toast.error('読み込みに失敗したままなので保存できません。ページを再読み込みしてください。');
      return;
    }
    // 自動保存が実行中なら手動保存を開始しない（同じ expectedUpdatedAt を持つ 2 リクエストが
    // 競走して片方が誤 Conflict になる自己競合を防ぐ）。ボタンの disabled は次レンダーまで
    // 反映されないため、描画状態ではなく実行中フラグ自体をここで検査する。
    // 実行中に入った編集分は完了後の追撃自動保存が拾う。
    if (saveInFlightRef.current) {
      followUpRef.current = true;
      return;
    }
    if (blockedItemIds.size > 0) {
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
    const isAllEmpty = items.every((item) => isBlockInputEmpty(itemToBlockInput(item)));
    if (isAllEmpty) {
      const confirmed = window.confirm('内容が空です。保存すると全内容が消えます。続けますか？');
      if (!confirmed) return;
    }

    const payload = {
      title,
      blocks: items.map(itemToBlockInput),
      sheetId: activeSheetId || undefined,
      expectedUpdatedAt: savedUpdatedAtRef.current,
    };
    const savedSnapshot = snapshot(items, title);

    startSaving(async () => {
      // 手動保存も自動保存と同じ実行中フラグを共有し、同時保存（expectedUpdatedAt の
      // 取り違えによる誤 Conflict）を防ぐ。実行中の編集分は追撃自動保存が拾う。
      saveInFlightRef.current = true;
      try {
        const result = await saveMutation.mutateAsync(payload);
        savedRef.current = true;
        // A4: 次回の競合判定基準にはサーバーが返した updatedAt を使う。クライアント
        // 時計は使わない（サーバー時刻とズレると誤 Conflict を招くため）。
        savedUpdatedAtRef.current = new Date(result.updatedAt);
        if (savedTitleRef.current !== payload.title) {
          savedTitleRef.current = payload.title;
          void utils.sheet.list.invalidate();
        }
        // 保存成功した内容をスナップショットとして記録し、dirty を解除する
        // （保存中に編集が入っていた場合は dirty のままにする）。
        lastSavedSnapshotRef.current = savedSnapshot;
        setIsDirty(snapshot(itemsRef.current, titleRef.current) !== savedSnapshot);
        setAutosaveStatus('idle');
        toast.success('保存しました');
      } catch (err) {
        if (err instanceof TRPCClientError && err.data?.code === 'UNAUTHORIZED') {
          toast.error('セッションが切れました。再度認証してください。');
        } else if (err instanceof TRPCClientError && err.data?.code === 'CONFLICT') {
          // 手動保存で競合を検出した場合も自動保存を恒久停止する
          // （直後の自動保存が同じ競合を繰り返し踏むのを防ぐ）。
          autosaveStoppedRef.current = true;
          followUpRef.current = false;
          setAutosaveStatus('conflict');
          const reload = window.confirm(
            'このシートは別のセッションで更新されています。ページをリロードして最新版を確認しますか？',
          );
          // router.refresh() はサーバコンポーネントを再取得するだけで、key={activeSheetId} が
          // 変わらない BuilderClient は再マウントされず古いローカル state が残る。
          // 競合インジケータの再読み込みボタンと同じくフルリロードで最新版を反映する。
          if (reload) window.location.reload();
        } else {
          toast.error('保存に失敗しました');
        }
      } finally {
        saveInFlightRef.current = false;
      }
      // 手動保存の実行中に編集が続いていた場合の追撃自動保存。
      if (followUpRef.current && !autosaveStoppedRef.current) {
        followUpRef.current = false;
        void runAutosave();
      }
    });
  };

  // トップバーの自動保存インジケータ表示（競合 > 保存中 > 失敗 > 未保存 > 保存済みの優先順。
  // 初期状態（未編集・未保存）は何も表示しない）。
  const autosaveIndicator =
    autosaveStatus === 'conflict'
      ? { label: '競合 — 再読み込みが必要', dotClass: 'bg-destructive', textClass: 'text-destructive' }
      : blockedItemIds.size > 0
        ? {
            // 重複・未入力のどちらでもブロックされるため「重複」と断定しない
            // （chatgpt-codex-connector レビュー指摘）。実際の原因は行単位のエラー表示で示す。
            label: '項目名を確認してください（重複/未入力）— 保存できません',
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
            : isDirty
              ? { label: '未保存の変更', dotClass: 'bg-[#d4a017]', textClass: 'text-faint' }
              : autosaveStatus === 'saved'
                ? { label: '保存済み（自動）', dotClass: 'bg-accent-text', textClass: 'text-faint' }
                : null;

  return (
    <div className="min-h-screen">
      {loadFailure && (
        <div
          role="alert"
          className="border-b border-danger/40 bg-danger-soft px-4 py-2 text-center text-sm text-danger"
        >
          {loadFailure === 'config'
            ? '保存済みのシートを読み込めませんでした（サーバー設定が未完了の可能性があります）。既存の内容を上書きしないよう、保存は止めてあります。'
            : '保存済みのシートを読み込めませんでした。既存の内容を上書きしないよう、保存は止めてあります。ページを再読み込みしてください。'}
        </div>
      )}
      {/* テンプレート選択ダイアログ */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-xl">
            <h2 className="mb-4 text-base font-semibold">新規シートを作成</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="new-sheet-title" className="mb-1 block text-sm font-medium text-muted-foreground">
                  タイトル
                </label>
                <input
                  id="new-sheet-title"
                  value={newSheetTitle}
                  onChange={(e) => setNewSheetTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmCreate();
                    if (e.key === 'Escape') setShowCreateDialog(false);
                  }}
                  className="w-full min-h-11 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label htmlFor="new-sheet-template" className="mb-1 block text-sm font-medium text-muted-foreground">
                  テンプレート
                </label>
                <select
                  id="new-sheet-template"
                  value={newSheetTemplateId}
                  onChange={(e) => setNewSheetTemplateId(e.target.value)}
                  className="w-full min-h-11 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowCreateDialog(false)}>
                キャンセル
              </Button>
              <Button size="sm" onClick={handleConfirmCreate} disabled={!newSheetTitle.trim()}>
                作成
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* data-slot: 案件エディタが左右ペインを固定する基準にこの高さを実測で使う。 */}
      <header
        data-slot="builder-topbar"
        className="no-print sticky top-0 z-20 border-b border-border bg-[color-mix(in_srgb,var(--card)_90%,transparent)] backdrop-blur-md"
      >
        <div
          className={`mx-auto flex items-center justify-between gap-2 px-4 py-3.5 sm:px-7 ${
            activeTab === 'project' ? 'max-w-none' : 'max-w-6xl'
          }`}
        >
          <div className="flex min-w-0 items-baseline gap-3">
            <h1 className="min-w-0 truncate text-lg font-bold">スキルシートビルダー</h1>
            {/* 案件エディタの breadcrumb（会社 / 案件NN） */}
            {activeTab === 'project' && projectCrumb && (
              <span className="hidden truncate font-mono text-[11.5px] text-faint md:inline">
                {projectCrumb.companyName || '(会社名未入力)'} / 案件{' '}
                {projectCrumb.visibleNo > 0 ? String(projectCrumb.visibleNo).padStart(2, '0') : '（非表示）'}
              </span>
            )}
          </div>
          {/* SP では自動保存インジケータのラベルが長い（「自動保存に失敗 — 保存ボタンで再試行」で
              210px）。shrink-0 + whitespace-nowrap のままだと操作群が画面外へ押し出され、
              375px/320px で横スクロールが発生し、**メッセージが押せと言っている保存ボタン自体が
              画面外に出て押せなくなる**（実機実測: 右端 394px > 幅 375px。gap-1 だった頃から続く既存不具合）。
              SP だけ折り返しを許可し、インジケータが自分の行へ落ちるようにする。
              sm 以上は従来どおり1行（flex-nowrap + shrink-0）。 */}
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 sm:shrink-0 sm:flex-nowrap">
            {activeTab === 'project' && (
              <button type="button" onClick={() => setHistoryOpen(true)} className="btn sm">
                ↺ 履歴
              </button>
            )}
            {activeTab === 'project' && (
              <button
                type="button"
                onClick={() => setShowProjectPreview((v) => !v)}
                aria-pressed={showProjectPreview}
                className="pv-toggle btn sm"
              >
                {/* ペイン非表示時に「プレビュー」だけだと、隣の別窓起動ボタン（同じく
                    「プレビュー」表記）と可視ラベルが完全一致して判別できなかった（#152 S-5）。 */}
                ◧ {showProjectPreview ? 'プレビューを隠す' : 'プレビューを表示'}
              </button>
            )}
            <Button
              variant="ghost"
              size="default"
              className="h-11"
              onClick={handleOpenPreview}
              aria-label="プレビューを別ウィンドウで開く"
            >
              <Eye className="size-4 sm:mr-1.5" />
              <span className="hidden sm:inline">プレビュー</span>
            </Button>
            {/* 自動保存インジケータ: 保存中… / 保存済み（自動）/ 未保存の変更 / 競合 */}
            {autosaveIndicator && (
              <span
                data-slot="autosave-indicator"
                role="status"
                className={`inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-[11px] ${autosaveIndicator.textClass}`}
              >
                <span aria-hidden className={`size-[7px] rounded-full ${autosaveIndicator.dotClass}`} />
                {autosaveIndicator.label}
                {autosaveStatus === 'conflict' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-1 h-9 px-2 text-xs"
                    onClick={() => window.location.reload()}
                  >
                    再読み込み
                  </Button>
                )}
              </span>
            )}
            <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="テーマ切り替え">
              {mode === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Button variant="outline" size="default" className="hidden h-11 sm:inline-flex" onClick={handleExport}>
              <Download className="mr-1.5 size-4" />
              バックアップ
            </Button>
            <Button asChild variant="ghost" className="hidden h-11 px-3 sm:inline-flex">
              <Link
                href="/view"
                className="text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  // クライアント遷移では beforeunload が発火しないため、dirty 時はここで確認する
                  if (!confirmDiscardChanges()) e.preventDefault();
                }}
              >
                閲覧へ
              </Link>
            </Button>
            {/* 自動保存の実行中も無効化し、同時保存（expectedUpdatedAt 取り違えの誤 Conflict）を防ぐ */}
            <Button
              onClick={handleSave}
              disabled={isSaving || autosaveStatus === 'saving'}
              aria-label={isSaving ? '保存中' : '保存'}
              className="h-11"
            >
              <Save className="size-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{isSaving ? '保存中...' : '保存'}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* プレビューは別ウィンドウに分離（ヘッダーの「プレビュー」ボタンで開く）。
          案件エディタタブは 3 ペイン（ナビ/フォーム/プレビュー）を持つため全幅にする。 */}
      {/* 案件エディタは 3 ペインを画面幅いっぱいに敷くため、余白付きの中央寄せコンテナを使わない。 */}
      <div className={activeTab === 'project' ? 'max-w-none' : 'mx-auto max-w-5xl px-4 py-6 sm:px-6'}>
        {/* エディタ */}
        {/* min-w-0: CSS Grid アイテムは既定で min-width:auto のため、子の truncate/
            overflow-x-auto が効かず内容量でトラック自体が押し広げられる（grid blowout）。
            375px でページ全体が横スクロールする不具合の根本原因だった（実機確認）。 */}
        <div className={`min-w-0 ${activeTab === 'project' ? '' : 'space-y-3'}`}>
          <div className={`space-y-3 ${activeTab === 'project' ? 'px-4 py-4 sm:px-7' : ''}`}>
            {/* シートセレクター */}
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">シート一覧</span>
                <button
                  type="button"
                  onClick={handleCreateSheet}
                  disabled={isSheetOp}
                  className="inline-flex h-11 items-center gap-1 rounded px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  <Plus className="size-4" />
                  新規シート
                </button>
              </div>
              <ul className="space-y-1">
                {sheets.map((sheet) => (
                  <li key={sheet.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (sheet.id === activeSheetId) return;
                        // シート切替は key={activeSheetId} の再マウントで編集中 state を破棄する
                        if (!confirmDiscardChanges()) return;
                        router.push(`/builder?sheet=${sheet.id}`);
                      }}
                      className={`flex min-h-11 min-w-0 flex-1 items-center gap-1.5 truncate rounded px-2 py-1 text-left text-sm ${
                        // 選択中の背景も bg-primary だと 3.74:1 で AA 未達（Issue #198 の横展開漏れ）。
                        sheet.id === activeSheetId ? 'bg-primary-dark text-primary-foreground' : 'hover:bg-muted'
                      }`}
                    >
                      <FileText className="size-4 shrink-0" />
                      <span className="truncate">{sheet.title}</span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteSheet(sheet.id, sheet.title)}
                      disabled={isSheetOp || sheets.length <= 1}
                      aria-label={`「${sheet.title}」を削除`}
                      className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <label htmlFor="sheet-title" className="mb-1 block text-sm font-medium text-muted-foreground">
                タイトル
              </label>
              <input
                id="sheet-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="スキルシートのタイトル"
                className="w-full min-h-11 rounded-md border border-input bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* タブ切り替え */}
            <div className="flex border-b border-border">
              <button
                type="button"
                onClick={() => setActiveTab('blocks')}
                className={`min-h-11 px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'blocks'
                    ? 'border-b-2 border-primary text-primary-dark'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                ブロック編集
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('project')}
                className={`min-h-11 px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === 'project'
                    ? 'border-b-2 border-primary text-primary-dark'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                案件エディタ
              </button>
            </div>
          </div>

          {activeTab === 'project' &&
            (() => {
              const projectItem = items.find((i) => i.type === 'project') as
                | { id: string; type: 'project'; data: ProjectBlockData }
                | undefined;
              return (
                <ProjectEditor
                  data={projectItem?.data ?? { companies: [], items: [] }}
                  onChange={updateProjectData}
                  onSelectionChange={handleProjectSelectionChange}
                  showPreview={showProjectPreview}
                />
              );
            })()}

          {historyOpen && (
            <HistoryDrawer entries={history} onClose={() => setHistoryOpen(false)} onRestore={restoreProjectData} />
          )}

          {activeTab === 'blocks' && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              {/* パレット: ドラッグしてキャンバスへドロップ */}
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2">
                <span className="text-xs text-muted-foreground">ドラッグして追加:</span>
                {PALETTE_ITEMS.map((p) => (
                  <PaletteChip key={p.blockType} {...p} />
                ))}
              </div>

              {/* キャンバス */}
              <CanvasDroppable>
                <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {items.map((item) => (
                      <SortableBlock
                        key={item.id}
                        item={item}
                        onMarkdownChange={updateMarkdown}
                        onTableChange={updateTable}
                        onSkillsChange={updateSkills}
                        onExperienceChange={updateExperience}
                        onProfileChange={updateProfile}
                        onProfileValidityChange={handleProfileValidityChange}
                        customDraft={getProfileCustomDraft(item.id)}
                        onCustomDraftChange={(rows) => setProfileCustomDraft(item.id, rows)}
                        onDelete={deleteBlock}
                        onMoveBlock={moveBlock}
                      />
                    ))}
                  </div>
                </SortableContext>
                {items.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                    ブロックがありません。パレットからドラッグするか、下のボタンで追加してください。
                  </p>
                )}
              </CanvasDroppable>

              {/* ドラッグ中のオーバーレイ（パレットチップのゴースト） */}
              <DragOverlay>{activePaletteType && <DragPreview blockType={activePaletteType} />}</DragOverlay>
            </DndContext>
          )}

          {activeTab === 'blocks' && (
            // flex-wrap: 4ボタンが flex-1 均等割りだと 375px 幅でラベルの最小幅を
            // 確保しきれず横スクロールの原因になっていた（実機確認）。折り返し可能にする。
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={addMarkdownBlock} className="h-11 flex-1">
                <Plus className="mr-1.5 size-4" />
                テキスト
              </Button>
              <Button variant="outline" onClick={addTableBlock} className="h-11 flex-1">
                <Table className="mr-1.5 size-4" />
                テーブル
              </Button>
              <Button variant="outline" onClick={addSkillsBlock} className="h-11 flex-1">
                <Plus className="mr-1.5 size-4" />
                スキル一覧
              </Button>
              <Button variant="outline" onClick={addExperienceBlock} className="h-11 flex-1">
                <Plus className="mr-1.5 size-4" />
                職務経歴
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BuilderClient;
