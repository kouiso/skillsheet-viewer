'use client';

import SkillSheetViewer from '@/component/skill-sheet-viewer';
import type { Block } from '@/db/block';
import { assembleMarkdown, type EditorItem, itemToBlockInput } from './serialize';

export function WorkspaceBlockPreview({
  item,
  items,
  referenceMonth,
}: {
  item: EditorItem;
  items: EditorItem[];
  referenceMonth: number;
}) {
  // 閲覧画面と同じ変換・部品で表示し、プレビュー専用の保存フィールドや本文の省略を作らない。
  const blocks = items.map((entry, order) => ({ ...itemToBlockInput(entry), id: entry.id, order }) as Block);
  return (
    <div className="min-w-0 p-4">
      <h2 className="mb-4 text-sm font-semibold text-muted-foreground">閲覧時の見え方</h2>
      <SkillSheetViewer
        skillSheet={{ title: '', content: assembleMarkdown([item]) }}
        blocks={blocks}
        previewBlockId={item.id}
        compareMode
        referenceMonth={referenceMonth}
      />
    </div>
  );
}
