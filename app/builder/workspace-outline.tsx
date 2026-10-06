'use client';

import { useDraggable, useDroppable } from '@dnd-kit/core';
import { useId } from 'react';

export interface WorkspaceOutlineItem {
  id: string;
  title: string;
  kind: string;
  warningCount?: number;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}
export function WorkspaceOutline({
  items,
  selectedId,
  onSelect,
  onMove,
  compact = false,
}: {
  items: WorkspaceOutlineItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  onMove?: (id: string, direction: 'up' | 'down') => void;
  compact?: boolean;
}) {
  return (
    <nav className={compact ? 'grid gap-1 p-1' : 'grid gap-1 p-2'} aria-label="ブロック一覧">
      {items.map((item, index) => (
        <OutlineRow
          key={item.id}
          item={item}
          index={index}
          selectedId={selectedId}
          onSelect={onSelect}
          onMove={onMove}
          compact={compact}
        />
      ))}
    </nav>
  );
}

function OutlineRow({
  item,
  index,
  selectedId,
  onSelect,
  onMove,
  compact,
}: {
  item: WorkspaceOutlineItem;
  index: number;
  selectedId: string;
  onSelect: (id: string) => void;
  onMove?: (id: string, direction: 'up' | 'down') => void;
  compact: boolean;
}) {
  const instanceId = useId();
  const { setNodeRef } = useDroppable({ id: `outline:${instanceId}`, data: { blockId: item.id } });
  const {
    setNodeRef: setDragRef,
    attributes,
    listeners,
    isDragging,
  } = useDraggable({
    id: `outline-drag:${instanceId}`,
    data: { blockId: item.id, type: 'block' },
    disabled: !onMove,
  });
  const selected = item.id === selectedId;
  const actionClass =
    'min-h-11 min-w-11 rounded border border-border bg-card text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:text-muted-foreground';
  return (
    <div ref={setNodeRef} className={isDragging ? 'rounded outline-2 outline-primary' : 'min-w-0'}>
      <div className={compact ? 'grid min-w-0' : 'flex min-w-0 items-stretch'}>
        <button
          type="button"
          aria-current={item.id === selectedId ? 'true' : undefined}
          aria-label={`${item.kind}: ${item.title}`}
          title={`${item.kind}: ${item.title}`}
          onClick={() => onSelect(item.id)}
          className={`min-h-11 min-w-0 flex-1 rounded border px-2 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${item.id === selectedId ? 'border-primary bg-accent text-accent-foreground font-semibold' : 'border-transparent bg-card text-foreground hover:bg-muted'}`}
        >
          {compact ? (
            <span aria-hidden="true" className="block text-center font-mono">
              {index + 1}
            </span>
          ) : (
            <>
              <span className="block text-xs text-muted-foreground">{item.kind}</span>
              <span className="block break-words">{item.title}</span>
            </>
          )}
          {Boolean(item.warningCount) && (
            <span
              aria-hidden="true"
              title={`${item.warningCount}か所の入力確認が必要`}
              className="ml-1 font-semibold text-warn-strong"
            >
              !
            </span>
          )}
        </button>
        {onMove && (
          <button
            ref={setDragRef}
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`${item.title}をドラッグして移動`}
            title="ドラッグして移動"
            className={`${actionClass} touch-none cursor-grab active:cursor-grabbing`}
          >
            <span aria-hidden="true">⠿</span>
          </button>
        )}
      </div>
      {onMove && selected && (
        <fieldset
          className={compact ? 'grid gap-1 pt-1' : 'flex justify-end gap-1 pt-1'}
          aria-label={`${item.title}の並べ替え`}
        >
          <button
            type="button"
            className={actionClass}
            disabled={item.canMoveUp === false}
            aria-label={`${item.title}を上へ移動`}
            onClick={() => onMove(item.id, 'up')}
          >
            <span aria-hidden="true">↑</span>
          </button>
          <button
            type="button"
            className={actionClass}
            disabled={item.canMoveDown === false}
            aria-label={`${item.title}を下へ移動`}
            onClick={() => onMove(item.id, 'down')}
          >
            <span aria-hidden="true">↓</span>
          </button>
        </fieldset>
      )}
    </div>
  );
}
