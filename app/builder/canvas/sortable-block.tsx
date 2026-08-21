'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2 } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import type { ExperienceBlockData, ProfileBlockData, SkillEntry, TableColumn } from '@/db/blocks';

import { ExperienceBlockEditor } from '../block-editors/experience-block-editor';
import { type CustomMetaRow, ProfileBlockEditor } from '../block-editors/profile-block-editor';
import { SkillsBlockEditor } from '../block-editors/skills-block-editor';
import { TableBlockEditor } from '../block-editors/table-block-editor';
import type { EditorItem } from '../serialize';

export const SortableBlock = ({
  item,
  onMarkdownChange,
  onTableChange,
  onSkillsChange,
  onExperienceChange,
  onProfileChange,
  onProfileValidityChange,
  customDraft,
  onCustomDraftChange,
  onDelete,
  onMoveBlock,
}: {
  item: EditorItem;
  onMarkdownChange: (id: string, markdown: string) => void;
  onTableChange: (id: string, columns: TableColumn[], rows: string[][]) => void;
  onSkillsChange: (id: string, category: string, skills: SkillEntry[]) => void;
  onExperienceChange: (id: string, data: ExperienceBlockData) => void;
  onProfileChange: (id: string, data: ProfileBlockData) => void;
  onProfileValidityChange: (id: string, hasConflict: boolean) => void;
  customDraft?: CustomMetaRow[];
  onCustomDraftChange?: (rows: CustomMetaRow[]) => void;
  onDelete: (id: string) => void;
  onMoveBlock: (id: string, direction: -1 | 1) => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      onMoveBlock(item.id, event.key === 'ArrowUp' ? -1 : 1);
    }
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      // items-start 欠落で align-items:stretch（既定）になり、ドラッグハンドルが行の
      // 全高に引き伸ばされて中身のアイコンが垂直中央に見えていた（削除ボタンは shadcn
      // Button の内部 flex で自己完結して上端寄りに見えるため非対称だった）（#152 S-5）。
      className="flex items-start gap-2 rounded-lg border border-border bg-card p-3 shadow-sm"
    >
      <button
        type="button"
        className="inline-flex h-11 w-11 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground active:cursor-grabbing"
        aria-label="ブロックを並べ替え"
        {...attributes}
        {...listeners}
        onKeyDown={handleKeyDown}
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
      ) : item.type === 'skills' ? (
        <SkillsBlockEditor
          category={item.category}
          skills={item.skills}
          onChange={(category, skills) => onSkillsChange(item.id, category, skills)}
        />
      ) : item.type === 'experience' ? (
        <ExperienceBlockEditor
          data={{
            company: item.company,
            startDate: item.startDate,
            endDate: item.endDate,
            role: item.role,
            description: item.description,
          }}
          onChange={(data) => onExperienceChange(item.id, data)}
        />
      ) : item.type === 'profile' ? (
        <ProfileBlockEditor
          data={{
            name: item.name,
            title: item.title,
            pr: item.pr,
            strengths: item.strengths,
            meta: item.meta,
            company: item.company,
          }}
          onChange={(data) => onProfileChange(item.id, data)}
          id={item.id}
          onValidityChange={onProfileValidityChange}
          customDraft={customDraft}
          onCustomDraftChange={onCustomDraftChange}
        />
      ) : item.type === 'stats' ? (
        <div className="min-w-0 flex-1 rounded border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium">統計:</span>{' '}
          {item.data.items.map((i) => `${i.value}${i.unit} ${i.label}`).join(' / ') || '(未入力)'}
          <p className="mt-0.5 text-xs opacity-70">※ 案件エディタタブで編集</p>
        </div>
      ) : item.type === 'project' ? (
        <div className="min-w-0 flex-1 rounded border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium">案件:</span> {item.data.companies.length} 社 / {item.data.items.length} 件
          <p className="mt-0.5 text-xs opacity-70">※ 案件エディタタブで編集</p>
        </div>
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
