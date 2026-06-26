'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
// tableBlockToMarkdown 等の純関数/型はサーバ専用モジュール（neon ドライバ等）を
// client バンドルに巻き込まないため、root の @skillsheet/db ではなく純粋サブエクスポート
// @skillsheet/db/blocks から import する。
import {
  type Block,
  type BlockInput,
  isBlockInputEmpty,
  type TableAlign,
  type TableColumn,
  tableBlockToMarkdown,
} from '@skillsheet/db/blocks';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Download,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Save,
  Table,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import SkillSheetViewer from '@/component/skill-sheet-viewer';
import { Button } from '@/components/ui/button';

import { saveBlocksAction } from './actions';

// エディタ上のブロック。type と内容を一致させた判別ユニオン（DB の Block に対応）。
type EditorItem =
  | { id: string; type: 'markdown'; markdown: string }
  | { id: string; type: 'table'; columns: TableColumn[]; rows: string[][] };

interface BuilderClientProps {
  initialBlocks: Block[];
  initialTitle: string;
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `b-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// 初期ブロックの ID は SSR/CSR で一致させるためインデックス基準の安定値にする
// （newId() は乱数/時刻依存でハイドレーション不整合を起こす）。追加ブロックのみ newId()。
const blockToItem = (block: Block, index: number): EditorItem => {
  const id = `block-${index}`;
  if (block.type === 'markdown') return { id, type: 'markdown', markdown: block.data.markdown };
  return { id, type: 'table', columns: block.data.columns, rows: block.data.rows };
};

const itemToBlockInput = (item: EditorItem): BlockInput =>
  item.type === 'markdown'
    ? { type: 'markdown', data: { markdown: item.markdown } }
    : { type: 'table', data: { columns: item.columns, rows: item.rows } };

// 1 ブロックを markdown 文字列へ（table は GFM 表へ変換）。プレビュー/バックアップ/dirty で共有。
const itemToMarkdown = (item: EditorItem): string =>
  item.type === 'markdown' ? item.markdown : tableBlockToMarkdown({ columns: item.columns, rows: item.rows });

const assembleMarkdown = (items: EditorItem[]): string => items.map(itemToMarkdown).join('\n');

// dirty 比較用スナップショット（タイトル＋組み立て済み markdown 文字列）。
// typed item を直接比較せず、保存される最終形（markdown）で差分を見る。
const snapshot = (items: EditorItem[], title: string): string => JSON.stringify([title, assembleMarkdown(items)]);

const ALIGN_OPTIONS: { value: TableAlign; Icon: typeof AlignLeft; label: string }[] = [
  { value: 'left', Icon: AlignLeft, label: '左揃え' },
  { value: 'center', Icon: AlignCenter, label: '中央揃え' },
  { value: 'right', Icon: AlignRight, label: '右揃え' },
];

// Excel 風グリッド編集の中心。ヘッダ=列 label 入力＋列 align トグル、本文=セルごと <input>。
// セルは <input> なので入力時に改行が混入しない（GFM 表崩れ・PDF の改行欠落を回避）。
const TableBlockEditor = ({
  columns,
  rows,
  onChange,
}: {
  columns: TableColumn[];
  rows: string[][];
  onChange: (columns: TableColumn[], rows: string[][]) => void;
}) => {
  const setLabel = (ci: number, label: string) =>
    onChange(
      columns.map((c, i) => (i === ci ? { ...c, label } : c)),
      rows,
    );
  const setAlign = (ci: number, align: TableAlign) =>
    onChange(
      columns.map((c, i) => (i === ci ? { ...c, align } : c)),
      rows,
    );
  const setCell = (ri: number, ci: number, value: string) =>
    onChange(
      columns,
      rows.map((row, r) => (r === ri ? row.map((cell, c) => (c === ci ? value : cell)) : row)),
    );
  const addColumn = () =>
    onChange(
      [...columns, { label: '', align: 'left' }],
      rows.map((row) => [...row, '']),
    );
  const removeColumn = (ci: number) => {
    if (columns.length <= 1) return; // 列は最低 1 列残す
    onChange(
      columns.filter((_, i) => i !== ci),
      rows.map((row) => row.filter((_, i) => i !== ci)),
    );
  };
  const addRow = () => onChange(columns, [...rows, columns.map(() => '')]);
  const removeRow = (ri: number) =>
    onChange(
      columns,
      rows.filter((_, i) => i !== ri),
    );

  return (
    <div className="min-w-0 flex-1 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {columns.map((col, ci) => (
              // 列の追加/削除でインデックス key がずれてもセル focus 喪失は許容（MVP）。
              // biome-ignore lint/suspicious/noArrayIndexKey: 列は順序で管理し安定 id を持たない
              <th key={ci} className="border border-border p-1 align-top">
                <div className="flex flex-col gap-1">
                  <input
                    value={col.label}
                    onChange={(e) => setLabel(ci, e.target.value)}
                    placeholder={`列${ci + 1}`}
                    aria-label={`列${ci + 1}の見出し`}
                    className="w-full min-w-24 rounded border border-input bg-background px-2 py-1 font-medium focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex items-center gap-1">
                    {ALIGN_OPTIONS.map(({ value, Icon, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setAlign(ci, value)}
                        aria-label={`列${ci + 1}を${label}`}
                        aria-pressed={col.align === value}
                        className={`rounded p-1 ${
                          col.align === value
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <Icon className="size-3.5" />
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => removeColumn(ci)}
                      disabled={columns.length <= 1}
                      aria-label={`列${ci + 1}を削除`}
                      className="ml-auto rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </th>
            ))}
            <th className="border border-border p-1 align-middle">
              <button
                type="button"
                onClick={addColumn}
                aria-label="列を追加"
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <Plus className="size-4" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 行は順序で管理し安定 id を持たない
            <tr key={ri}>
              {columns.map((_, ci) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: セルは行列インデックスで一意
                <td key={ci} className="border border-border p-1">
                  <input
                    value={row[ci] ?? ''}
                    onChange={(e) => setCell(ri, ci, e.target.value)}
                    aria-label={`${ri + 1}行${ci + 1}列`}
                    className="w-full min-w-24 rounded border border-input bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </td>
              ))}
              <td className="border border-border p-1 text-center align-middle">
                <button
                  type="button"
                  onClick={() => removeRow(ri)}
                  aria-label={`${ri + 1}行目を削除`}
                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={addRow}
        className="mt-1 flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-3.5" />
        行を追加
      </button>
    </div>
  );
};

const SortableBlock = ({
  item,
  onMarkdownChange,
  onTableChange,
  onDelete,
}: {
  item: EditorItem;
  onMarkdownChange: (id: string, markdown: string) => void;
  onTableChange: (id: string, columns: TableColumn[], rows: string[][]) => void;
  onDelete: (id: string) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex gap-2 rounded-lg border border-border bg-card p-3 shadow-sm">
      <button
        type="button"
        className="mt-1 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        aria-label="ブロックを並べ替え"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-5" />
      </button>
      {item.type === 'markdown' ? (
        <textarea
          value={item.markdown}
          onChange={(e) => onMarkdownChange(item.id, e.target.value)}
          rows={Math.min(12, Math.max(3, item.markdown.split('\n').length))}
          className="min-w-0 flex-1 resize-y rounded-md border border-input bg-background p-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Markdown を入力..."
        />
      ) : (
        <TableBlockEditor
          columns={item.columns}
          rows={item.rows}
          onChange={(columns, rows) => onTableChange(item.id, columns, rows)}
        />
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(item.id)}
        aria-label="ブロックを削除"
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
};

const BuilderClient = ({ initialBlocks, initialTitle }: BuilderClientProps) => {
  const [items, setItems] = useState<EditorItem[]>(() => initialBlocks.map(blockToItem));
  const [title, setTitle] = useState(initialTitle);
  const [showPreview, setShowPreview] = useState(true);
  const [isSaving, startSaving] = useTransition();
  const savedRef = useRef(false);

  // 未保存変更の検知。最後に保存成功した時点のスナップショット（タイトル＋組み立て markdown）を
  // 保持し、現在の内容と差分があれば dirty とみなす（保存成功で更新）。
  const lastSavedSnapshotRef = useRef<string>(snapshot(initialBlocks.map(blockToItem), initialTitle));
  const [isDirty, setIsDirty] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // プレビューは重い（Markdown パース＋ハイライト）ため、入力のたびではなく
  // 300ms デバウンスして更新し、タイピングのラグを防ぐ。初期値は即時反映。
  const [previewContent, setPreviewContent] = useState(() => assembleMarkdown(items));

  useEffect(() => {
    const timer = setTimeout(() => {
      setPreviewContent(assembleMarkdown(items));
    }, 300);
    return () => clearTimeout(timer);
  }, [items]);

  // 現在の内容（タイトル含む）が最後の保存スナップショットと異なれば dirty にする。
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
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

  const deleteBlock = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

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

  // 破壊的な編集の前に、現在の内容をファイルとしてダウンロードして復元ポイントを残す。
  const handleExport = () => {
    const content = assembleMarkdown(items);
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    anchor.download = `skillsheet-backup-${stamp}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    toast.success('バックアップを書き出しました');
  };

  const handleSave = () => {
    // データ消失ガード: 全ブロックが空（type 別判定）なら、保存で全内容が消える。
    // 明示的な確認が取れた場合のみ続行する。
    const isAllEmpty = items.every((item) => isBlockInputEmpty(itemToBlockInput(item)));
    if (isAllEmpty) {
      const confirmed = window.confirm('内容が空です。保存すると全内容が消えます。続けますか？');
      if (!confirmed) return;
    }

    const payload = { title, blocks: items.map(itemToBlockInput) };
    const savedSnapshot = snapshot(items, title);

    startSaving(async () => {
      const res = await saveBlocksAction(payload);
      if (res.ok) {
        savedRef.current = true;
        // 保存成功した内容をスナップショットとして記録し、dirty を解除する。
        lastSavedSnapshotRef.current = savedSnapshot;
        setIsDirty(false);
        toast.success('保存しました');
      } else if (res.error === 'unauthorized') {
        toast.error('セッションが切れました。再度認証してください。');
      } else {
        toast.error('保存に失敗しました');
      }
    });
  };

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <h1 className="text-lg font-bold">スキルシートビルダー</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowPreview((v) => !v)}>
              {showPreview ? <EyeOff className="mr-1.5 size-4" /> : <Eye className="mr-1.5 size-4" />}
              プレビュー
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-1.5 size-4" />
              バックアップ
            </Button>
            <Link href="/view" className="text-sm text-muted-foreground hover:text-foreground">
              閲覧へ
            </Link>
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="mr-1.5 size-4" />
              {isSaving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-2">
        {/* エディタ */}
        <div className="space-y-3">
          <div>
            <label htmlFor="sheet-title" className="mb-1 block text-sm font-medium text-muted-foreground">
              タイトル
            </label>
            <input
              id="sheet-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="スキルシートのタイトル"
              className="w-full rounded-md border border-input bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {items.map((item) => (
                  <SortableBlock
                    key={item.id}
                    item={item}
                    onMarkdownChange={updateMarkdown}
                    onTableChange={updateTable}
                    onDelete={deleteBlock}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {items.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              ブロックがありません。下のボタンでテキストかテーブルを追加してください。
            </p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={addMarkdownBlock} className="flex-1">
              <Plus className="mr-1.5 size-4" />
              テキスト
            </Button>
            <Button variant="outline" onClick={addTableBlock} className="flex-1">
              <Table className="mr-1.5 size-4" />
              テーブル
            </Button>
          </div>
        </div>

        {/* ライブプレビュー */}
        {showPreview && (
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-2 text-sm font-medium text-muted-foreground">プレビュー</div>
            <SkillSheetViewer
              skillSheet={{ title: title.trim() || 'プレビュー', content: previewContent }}
              compareMode
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default BuilderClient;
