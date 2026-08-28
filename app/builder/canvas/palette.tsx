'use client';

import { useDraggable } from '@dnd-kit/core';
import { Plus, Table } from 'lucide-react';

import { type EditorItem, newId } from '../serialize';

export type PaletteBlockType = 'markdown' | 'table';

export const PALETTE_ITEMS: { blockType: PaletteBlockType; label: string; icon: React.ReactNode }[] = [
  { blockType: 'markdown', label: 'テキスト', icon: <Plus className="size-3.5" /> },
  { blockType: 'table', label: 'テーブル', icon: <Table className="size-3.5" /> },
];

/** パレット上のドラッグ可能チップ。canvas へドロップすると対応ブロックを挿入する。 */
export const PaletteChip = ({ blockType, label, icon }: (typeof PALETTE_ITEMS)[number]) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${blockType}`,
    data: { fromPalette: true, blockType },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      className={`inline-flex h-11 cursor-grab items-center gap-1 rounded border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary-dark active:cursor-grabbing ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      {icon}
      {label}
    </button>
  );
};

/** ドラッグ中のオーバーレイ用プレースホルダ。 */
export const DragPreview = ({ blockType }: { blockType: PaletteBlockType }) => (
  // text-primary（#0d9488）は薄い背景の上でライトテーマ 3.36:1 と AA 未達。文字色は --primary-dark を使う。
  <div className="flex items-center gap-1 rounded border border-primary bg-primary/10 px-3 py-1.5 text-primary-dark text-sm shadow-md">
    {blockType === 'markdown' ? <Plus className="size-3.5" /> : <Table className="size-3.5" />}
    {blockType === 'markdown' ? 'テキスト' : 'テーブル'}
  </div>
);

/** パレットからドロップされたブロック型に対応する初期 EditorItem を生成する。 */
export const createPaletteItem = (blockType: PaletteBlockType): EditorItem => {
  if (blockType === 'markdown') return { id: newId(), type: 'markdown', markdown: '' };
  return {
    id: newId(),
    type: 'table',
    columns: [
      { label: '項目', align: 'left' },
      { label: '内容', align: 'left' },
    ],
    rows: [['', '']],
  };
};
