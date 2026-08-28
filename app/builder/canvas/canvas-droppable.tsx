'use client';

import { useDroppable } from '@dnd-kit/core';

/** キャンバス全体のドロップゾーン。パレットから D&amp;D したとき、既存ブロックの間隔以外の空白領域でもドロップを受け付ける。 */
export const CanvasDroppable = ({ children }: { children: React.ReactNode }) => {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas-drop' });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-16 rounded-md transition-colors ${isOver ? 'bg-primary/5 ring-1 ring-primary/20' : ''}`}
    >
      {children}
    </div>
  );
};
