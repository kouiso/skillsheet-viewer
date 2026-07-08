'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
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
  type ExperienceBlockData,
  experienceBlockToMarkdown,
  isBlockInputEmpty,
  type ProfileBlockData,
  type ProjectBlockData,
  profileBlockToMarkdown,
  projectBlockToMarkdown,
  type SkillEntry,
  type StatsBlockData,
  skillsBlockToMarkdown,
  statsBlockToMarkdown,
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
  FileText,
  GripVertical,
  Plus,
  Save,
  Table,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import SkillSheetViewer from '@/component/skill-sheet-viewer';
import { Button } from '@/components/ui/button';

import { createSheetAction, deleteSheetAction, saveBlocksAction } from './actions';
import { ProjectEditor } from './project-editor';
import { TEMPLATES } from './templates';

type SheetSummary = { id: string; title: string; updatedAt: Date };

const REVOKE_DELAY_MS = 100;
const PREVIEW_DEBOUNCE_MS = 300;

// エディタ上のブロック。type と内容を一致させた判別ユニオン（DB の Block に対応）。
type EditorItem =
  | { id: string; type: 'markdown'; markdown: string }
  | { id: string; type: 'table'; columns: TableColumn[]; rows: string[][] }
  | { id: string; type: 'skills'; category: string; skills: SkillEntry[] }
  | ({ id: string; type: 'experience' } & ExperienceBlockData)
  | ({ id: string; type: 'profile' } & ProfileBlockData)
  | { id: string; type: 'stats'; data: StatsBlockData }
  | { id: string; type: 'project'; data: ProjectBlockData };

interface BuilderClientProps {
  initialBlocks: Block[];
  initialTitle: string;
  sheets: SheetSummary[];
  activeSheetId: string;
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `b-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// 初期ブロックの ID は SSR/CSR で一致させるためインデックス基準の安定値にする
// （newId() は乱数/時刻依存でハイドレーション不整合を起こす）。追加ブロックのみ newId()。
const blockToItem = (block: Block, index: number): EditorItem => {
  const id = `block-${index}`;
  switch (block.type) {
    case 'markdown':
      return { id, type: 'markdown', markdown: block.data.markdown };
    case 'table':
      return { id, type: 'table', columns: block.data.columns, rows: block.data.rows };
    case 'skills':
      return { id, type: 'skills', category: block.data.category, skills: block.data.skills };
    case 'experience':
      return { id, type: 'experience', ...block.data };
    case 'profile':
      return { id, type: 'profile', ...block.data };
    case 'stats':
      return { id, type: 'stats', data: block.data };
    case 'project':
      return { id, type: 'project', data: block.data };
  }
};

const itemToBlockInput = (item: EditorItem): BlockInput => {
  switch (item.type) {
    case 'markdown':
      return { type: 'markdown', data: { markdown: item.markdown } };
    case 'table':
      return { type: 'table', data: { columns: item.columns, rows: item.rows } };
    case 'skills':
      return { type: 'skills', data: { category: item.category, skills: item.skills } };
    case 'experience': {
      const { company, startDate, endDate, role, description } = item;
      return { type: 'experience', data: { company, startDate, endDate, role, description } };
    }
    case 'profile': {
      const { name, title, pr, strengths, meta } = item;
      return { type: 'profile', data: { name, title, pr, strengths, meta } };
    }
    case 'stats':
      return { type: 'stats', data: item.data };
    case 'project':
      return { type: 'project', data: item.data };
  }
};

// 1 ブロックを markdown 文字列へ（table/skills/experience は GFM 表・セクションへ変換）。
const itemToMarkdown = (item: EditorItem): string => {
  switch (item.type) {
    case 'markdown':
      return item.markdown;
    case 'table':
      return tableBlockToMarkdown({ columns: item.columns, rows: item.rows });
    case 'skills':
      return skillsBlockToMarkdown({ category: item.category, skills: item.skills });
    case 'experience': {
      const { company, startDate, endDate, role, description } = item;
      return experienceBlockToMarkdown({ company, startDate, endDate, role, description });
    }
    case 'profile': {
      const { name, title, pr, strengths, meta } = item;
      return profileBlockToMarkdown({ name, title, pr, strengths, meta });
    }
    case 'stats':
      return statsBlockToMarkdown(item.data);
    case 'project':
      return projectBlockToMarkdown(item.data);
  }
};

// ブロック間は空行区切り（\n\n）が必須。単一改行だと GFM テーブルが直前の段落に
// 「lazy continuation」として飲み込まれ、テーブルとして認識されずヘッダー/区切り行
// (:---:) がそのまま生テキストとして表示される不具合があった（PDF/プレビュー実機確認）。
const assembleMarkdown = (items: EditorItem[]): string => items.map(itemToMarkdown).join('\n\n');

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

const SkillsBlockEditor = ({
  category,
  skills,
  onChange,
}: {
  category: string;
  skills: SkillEntry[];
  onChange: (category: string, skills: SkillEntry[]) => void;
}) => {
  const setCategory = (v: string) => onChange(v, skills);
  const setSkill = (i: number, field: keyof SkillEntry, value: string | number) =>
    onChange(
      category,
      skills.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)),
    );
  const addSkill = () => onChange(category, [...skills, { name: '', years: 0, level: '' }]);
  const removeSkill = (i: number) =>
    onChange(
      category,
      skills.filter((_, idx) => idx !== i),
    );

  return (
    <div className="min-w-0 flex-1 space-y-2">
      <input
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="カテゴリ（例: プログラミング言語）"
        className="w-full rounded border border-input bg-background px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-border px-2 py-1 text-left text-xs text-muted-foreground">スキル</th>
              <th className="border border-border px-2 py-1 text-center text-xs text-muted-foreground w-20">
                経験年数
              </th>
              <th className="border border-border px-2 py-1 text-left text-xs text-muted-foreground">習熟度</th>
              <th className="border border-border px-1 py-1 w-8" />
            </tr>
          </thead>
          <tbody>
            {skills.map((s, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: スキル行は順序で管理
              <tr key={i}>
                <td className="border border-border p-1">
                  <input
                    value={s.name}
                    onChange={(e) => setSkill(i, 'name', e.target.value)}
                    placeholder="TypeScript"
                    aria-label={`スキル${i + 1}の名称`}
                    className="w-full rounded border border-input bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </td>
                <td className="border border-border p-1">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={s.years}
                    onChange={(e) => setSkill(i, 'years', Math.max(0, Number(e.target.value)))}
                    aria-label={`スキル${i + 1}の経験年数`}
                    className="w-full rounded border border-input bg-background px-2 py-1 text-center focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </td>
                <td className="border border-border p-1">
                  <input
                    value={s.level}
                    onChange={(e) => setSkill(i, 'level', e.target.value)}
                    placeholder="実務経験あり"
                    aria-label={`スキル${i + 1}の習熟度`}
                    className="w-full rounded border border-input bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </td>
                <td className="border border-border p-1 text-center">
                  <button
                    type="button"
                    onClick={() => removeSkill(i)}
                    aria-label={`スキル${i + 1}を削除`}
                    className="rounded p-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={addSkill}
        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Plus className="size-3.5" />
        スキルを追加
      </button>
    </div>
  );
};

const ExperienceBlockEditor = ({
  data,
  onChange,
}: {
  data: ExperienceBlockData;
  onChange: (data: ExperienceBlockData) => void;
}) => {
  const set = (field: keyof ExperienceBlockData, value: string) => onChange({ ...data, [field]: value });
  return (
    <div className="min-w-0 flex-1 space-y-2 text-sm">
      <input
        value={data.company}
        onChange={(e) => set('company', e.target.value)}
        placeholder="会社名"
        aria-label="会社名"
        className="w-full rounded border border-input bg-background px-2 py-1 font-medium focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex gap-2">
        <input
          value={data.startDate}
          onChange={(e) => set('startDate', e.target.value)}
          placeholder="開始（例: 2020-04）"
          aria-label="開始年月"
          className="flex-1 rounded border border-input bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="self-center text-muted-foreground">〜</span>
        <input
          value={data.endDate}
          onChange={(e) => set('endDate', e.target.value)}
          placeholder="終了（空欄=現在）"
          aria-label="終了年月"
          className="flex-1 rounded border border-input bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <input
        value={data.role}
        onChange={(e) => set('role', e.target.value)}
        placeholder="職種（例: フロントエンドエンジニア）"
        aria-label="職種"
        className="w-full rounded border border-input bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <textarea
        value={data.description}
        onChange={(e) => set('description', e.target.value)}
        rows={4}
        placeholder="業務内容"
        aria-label="業務内容"
        className="w-full resize-y rounded border border-input bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
};

const SortableBlock = ({
  item,
  onMarkdownChange,
  onTableChange,
  onSkillsChange,
  onExperienceChange,
  onDelete,
}: {
  item: EditorItem;
  onMarkdownChange: (id: string, markdown: string) => void;
  onTableChange: (id: string, columns: TableColumn[], rows: string[][]) => void;
  onSkillsChange: (id: string, category: string, skills: SkillEntry[]) => void;
  onExperienceChange: (id: string, data: ExperienceBlockData) => void;
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
        <div className="min-w-0 flex-1 rounded border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          <span className="font-medium">プロフィール:</span> {item.name || '(未入力)'} — {item.title || '(役職未入力)'}
          <p className="mt-0.5 text-xs opacity-70">※ 案件エディタタブで編集</p>
        </div>
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

type PaletteBlockType = 'markdown' | 'table';

const PALETTE_ITEMS: { blockType: PaletteBlockType; label: string; icon: React.ReactNode }[] = [
  { blockType: 'markdown', label: 'テキスト', icon: <Plus className="size-3.5" /> },
  { blockType: 'table', label: 'テーブル', icon: <Table className="size-3.5" /> },
];

/** パレット上のドラッグ可能チップ。canvas へドロップすると対応ブロックを挿入する。 */
const PaletteChip = ({ blockType, label, icon }: (typeof PALETTE_ITEMS)[number]) => {
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
      className={`flex cursor-grab items-center gap-1 rounded border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary active:cursor-grabbing ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      {icon}
      {label}
    </button>
  );
};

/** ドラッグ中のオーバーレイ用プレースホルダ。 */
const DragPreview = ({ blockType }: { blockType: PaletteBlockType }) => (
  <div className="flex items-center gap-1 rounded border border-primary bg-primary/10 px-3 py-1.5 text-sm text-primary shadow-md">
    {blockType === 'markdown' ? <Plus className="size-3.5" /> : <Table className="size-3.5" />}
    {blockType === 'markdown' ? 'テキスト' : 'テーブル'}
  </div>
);

/** キャンバス全体のドロップゾーン。パレットから D&amp;D したとき、既存ブロックの間隔以外の空白領域でもドロップを受け付ける。 */
const CanvasDroppable = ({ children }: { children: React.ReactNode }) => {
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

/** パレットからドロップされたブロック型に対応する初期 EditorItem を生成する。 */
const createPaletteItem = (blockType: PaletteBlockType): EditorItem => {
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

const BuilderClient = ({ initialBlocks, initialTitle, sheets: initialSheets, activeSheetId }: BuilderClientProps) => {
  const router = useRouter();
  const [items, setItems] = useState<EditorItem[]>(() => initialBlocks.map(blockToItem));
  const [title, setTitle] = useState(initialTitle);
  const [showPreview, setShowPreview] = useState(true);
  const [isSaving, startSaving] = useTransition();
  const [isSheetOp, startSheetOp] = useTransition();
  const [sheets, setSheets] = useState<SheetSummary[]>(initialSheets);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newSheetTitle, setNewSheetTitle] = useState('新しいスキルシート');
  // A3 並行保存ガード: 編集開始時（またはシート切替時）の updatedAt を保持する。
  // 保存成功時は new Date() で更新し、次回保存時の基準にする。
  const savedUpdatedAtRef = useRef<Date | undefined>(initialSheets.find((s) => s.id === activeSheetId)?.updatedAt);
  const [newSheetTemplateId, setNewSheetTemplateId] = useState(TEMPLATES[0].id);
  const savedRef = useRef(false);
  const [activePaletteType, setActivePaletteType] = useState<PaletteBlockType | null>(null);
  const [activeTab, setActiveTab] = useState<'blocks' | 'project'>('blocks');

  // 未保存変更の検知。最後に保存成功した時点のスナップショット（タイトル＋組み立て markdown）を
  // 保持し、現在の内容と差分があれば dirty とみなす（保存成功で更新）。
  const lastSavedSnapshotRef = useRef<string>(snapshot(initialBlocks.map(blockToItem), initialTitle));
  const [isDirty, setIsDirty] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.type === 'project');
      if (idx === -1) return [...prev, { id: newId(), type: 'project', data }];
      return prev.map((i) => (i.type === 'project' ? { ...i, data } : i));
    });
  };

  const ensureProjectBlock = () => {
    setItems((prev) => {
      if (prev.some((i) => i.type === 'project')) return prev;
      return [...prev, { id: newId(), type: 'project', data: { companies: [], items: [] } }];
    });
  };

  const handleCreateSheet = () => {
    setNewSheetTitle('新しいスキルシート');
    setNewSheetTemplateId(TEMPLATES[0].id);
    setShowCreateDialog(true);
  };

  const handleConfirmCreate = () => {
    const title = newSheetTitle.trim();
    if (!title) return;
    setShowCreateDialog(false);
    startSheetOp(async () => {
      const res = await createSheetAction(title, newSheetTemplateId);
      if (res.ok) {
        router.push(`/builder?sheet=${res.sheetId}`);
      } else {
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
      const res = await deleteSheetAction(sheetId);
      if (res.ok) {
        const remaining = sheets.filter((s) => s.id !== sheetId);
        setSheets(remaining);
        if (sheetId === activeSheetId) {
          router.push(`/builder?sheet=${remaining[0]?.id ?? ''}`);
        } else {
          router.refresh();
        }
        toast.success('シートを削除しました');
      } else {
        toast.error('シートの削除に失敗しました');
      }
    });
  };

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
    // モバイル/Firefox はダウンロード処理が非同期のため、即時 revoke だと失敗しうる。
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, REVOKE_DELAY_MS);
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

    const payload = {
      title,
      blocks: items.map(itemToBlockInput),
      sheetId: activeSheetId,
      expectedUpdatedAt: savedUpdatedAtRef.current,
    };
    const savedSnapshot = snapshot(items, title);

    startSaving(async () => {
      const res = await saveBlocksAction(payload);
      if (res.ok) {
        savedRef.current = true;
        // A4: 次回の競合判定基準にはサーバーが返した updatedAt を使う。クライアント
        // 時計は使わない（サーバー時刻とズレると誤 Conflict を招くため）。返却が無い
        // 古い経路のみ new Date() にフォールバックする。
        savedUpdatedAtRef.current = res.savedUpdatedAt ?? new Date();
        // 保存成功した内容をスナップショットとして記録し、dirty を解除する。
        lastSavedSnapshotRef.current = savedSnapshot;
        setIsDirty(false);
        toast.success('保存しました');
      } else if (res.error === 'unauthorized') {
        toast.error('セッションが切れました。再度認証してください。');
      } else if (res.error === 'conflict') {
        const reload = window.confirm(
          'このシートは別のセッションで更新されています。ページをリロードして最新版を確認しますか？',
        );
        if (reload) router.refresh();
      } else {
        toast.error('保存に失敗しました');
      }
    });
  };

  return (
    <div className="min-h-screen">
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
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
      <header className="no-print sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-4 sm:px-6">
          <h1 className="min-w-0 truncate text-lg font-bold">スキルシートビルダー</h1>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPreview((v) => !v)}
              aria-label={showPreview ? 'プレビューを非表示' : 'プレビューを表示'}
            >
              {showPreview ? <EyeOff className="size-4 sm:mr-1.5" /> : <Eye className="size-4 sm:mr-1.5" />}
              <span className="hidden sm:inline">プレビュー</span>
            </Button>
            <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={handleExport}>
              <Download className="mr-1.5 size-4" />
              バックアップ
            </Button>
            <Link href="/view" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">
              閲覧へ
            </Link>
            <Button onClick={handleSave} disabled={isSaving} aria-label={isSaving ? '保存中' : '保存'}>
              <Save className="size-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{isSaving ? '保存中...' : '保存'}</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-2">
        {/* エディタ */}
        {/* min-w-0: CSS Grid アイテムは既定で min-width:auto のため、子の truncate/
            overflow-x-auto が効かず内容量でトラック自体が押し広げられる（grid blowout）。
            375px でページ全体が横スクロールする不具合の根本原因だった（実機確認）。 */}
        <div className="min-w-0 space-y-3">
          {/* シートセレクター */}
          <div className="rounded-lg border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">シート一覧</span>
              <button
                type="button"
                onClick={handleCreateSheet}
                disabled={isSheetOp}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <Plus className="size-3.5" />
                新規シート
              </button>
            </div>
            <ul className="space-y-1">
              {sheets.map((sheet) => (
                <li key={sheet.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => router.push(`/builder?sheet=${sheet.id}`)}
                    className={`flex min-w-0 flex-1 items-center gap-1.5 truncate rounded px-2 py-1 text-left text-sm ${
                      sheet.id === activeSheetId ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                    }`}
                  >
                    <FileText className="size-3.5 shrink-0" />
                    <span className="truncate">{sheet.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSheet(sheet.id, sheet.title)}
                    disabled={isSheetOp || sheets.length <= 1}
                    aria-label={`「${sheet.title}」を削除`}
                    className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-30"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
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
              className="w-full rounded-md border border-input bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* タブ切り替え */}
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => setActiveTab('blocks')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'blocks'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              ブロック編集
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('project');
                ensureProjectBlock();
              }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === 'project'
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              案件エディタ
            </button>
          </div>

          {activeTab === 'project' &&
            (() => {
              const projectItem = items.find((i) => i.type === 'project') as
                | { id: string; type: 'project'; data: ProjectBlockData }
                | undefined;
              return (
                <div className="rounded border border-border bg-card p-3">
                  <ProjectEditor
                    data={projectItem?.data ?? { companies: [], items: [] }}
                    onChange={updateProjectData}
                  />
                </div>
              );
            })()}

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
                        onDelete={deleteBlock}
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
              <Button variant="outline" onClick={addMarkdownBlock} className="flex-1">
                <Plus className="mr-1.5 size-4" />
                テキスト
              </Button>
              <Button variant="outline" onClick={addTableBlock} className="flex-1">
                <Table className="mr-1.5 size-4" />
                テーブル
              </Button>
              <Button variant="outline" onClick={addSkillsBlock} className="flex-1">
                <Plus className="mr-1.5 size-4" />
                スキル一覧
              </Button>
              <Button variant="outline" onClick={addExperienceBlock} className="flex-1">
                <Plus className="mr-1.5 size-4" />
                職務経歴
              </Button>
            </div>
          )}
        </div>

        {/* ライブプレビュー */}
        {showPreview && (
          <div className="min-w-0 rounded-lg border border-border bg-card">
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
