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
import { Eye, EyeOff, GripVertical, Plus, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import SkillSheetViewer from '@/component/skill-sheet-viewer';
import { Button } from '@/components/ui/button';

import { saveBlocksAction } from './actions';

interface BlockItem {
  id: string;
  markdown: string;
}

interface BuilderClientProps {
  initialMarkdowns: string[];
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `b-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const SortableBlock = ({
  item,
  onChange,
  onDelete,
}: {
  item: BlockItem;
  onChange: (id: string, markdown: string) => void;
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
      <textarea
        value={item.markdown}
        onChange={(e) => onChange(item.id, e.target.value)}
        rows={Math.min(12, Math.max(3, item.markdown.split('\n').length))}
        className="min-w-0 flex-1 resize-y rounded-md border border-input bg-background p-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        placeholder="Markdown を入力..."
      />
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

const BuilderClient = ({ initialMarkdowns }: BuilderClientProps) => {
  // 初期ブロックの ID は SSR/CSR で一致させるためインデックス基準の安定値にする
  // （newId() は乱数/時刻依存でハイドレーション不整合を起こす）。追加ブロックのみ newId()。
  const [items, setItems] = useState<BlockItem[]>(() =>
    initialMarkdowns.map((markdown, index) => ({ id: `block-${index}`, markdown })),
  );
  const [showPreview, setShowPreview] = useState(true);
  const [isSaving, startSaving] = useTransition();
  const savedRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // プレビューは重い（Markdown パース＋ハイライト）ため、入力のたびではなく
  // 300ms デバウンスして更新し、タイピングのラグを防ぐ。初期値は即時反映。
  const [previewContent, setPreviewContent] = useState(() => items.map((i) => i.markdown).join('\n'));

  useEffect(() => {
    const timer = setTimeout(() => {
      setPreviewContent(items.map((i) => i.markdown).join('\n'));
    }, 300);
    return () => clearTimeout(timer);
  }, [items]);

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

  const updateBlock = (id: string, markdown: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, markdown } : i)));

  const deleteBlock = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const addBlock = () => setItems((prev) => [...prev, { id: newId(), markdown: '' }]);

  const handleSave = () => {
    startSaving(async () => {
      const res = await saveBlocksAction(items.map((i) => i.markdown));
      if (res.ok) {
        savedRef.current = true;
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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {items.map((item) => (
                  <SortableBlock key={item.id} item={item} onChange={updateBlock} onDelete={deleteBlock} />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {items.length === 0 && (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              ブロックがありません。「ブロック追加」で作成してください。
            </p>
          )}

          <Button variant="outline" onClick={addBlock} className="w-full">
            <Plus className="mr-1.5 size-4" />
            ブロック追加
          </Button>
        </div>

        {/* ライブプレビュー */}
        {showPreview && (
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-2 text-sm font-medium text-muted-foreground">プレビュー</div>
            <SkillSheetViewer skillSheet={{ title: 'プレビュー', content: previewContent }} compareMode />
          </div>
        )}
      </div>
    </div>
  );
};

export default BuilderClient;
