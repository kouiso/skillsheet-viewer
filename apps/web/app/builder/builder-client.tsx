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
  blockJoinSeparator,
  type ExperienceBlockData,
  experienceBlockToMarkdown,
  isBlockInputEmpty,
  type ProfileBlockData,
  type ProfileMeta,
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
  FileText,
  GripVertical,
  Moon,
  Plus,
  Save,
  Sun,
  Table,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { DateTokenPicker } from '@/components/date-token-picker';
import { SelectOrCustom } from '@/components/select-or-custom';
import { Button } from '@/components/ui/button';
import { useThemeMode } from '@/context/theme-context';

import { createSheetAction, deleteSheetAction, saveBlocksAction } from './actions';
import { ProjectEditor, type ProjectEditorSelection } from './project-editor';
import { TEMPLATES } from './templates';

type SheetSummary = { id: string; title: string; updatedAt: Date };

const LEVEL_OPTIONS = ['実務経験あり', '設計可能', '指導可能', '基礎知識のみ'];

const REVOKE_DELAY_MS = 100;
const PREVIEW_DEBOUNCE_MS = 300;
// 別ウィンドウプレビューとの連携キー。apps/web/app/builder/preview/preview-client.tsx と共有。
const PREVIEW_CHANNEL_NAME = 'builder-preview';
const PREVIEW_STORAGE_KEY = 'builder-preview-payload';

// 編集が止んでから自動保存を発火するまでの待ち時間。
const AUTOSAVE_DEBOUNCE_MS = 1500;

// 自動保存の状態機械。idle（初期）→ saving → saved を巡回し、
// conflict は終端（同一セッション中は自動保存を再開しない）。
// error は非競合の失敗（unauthorized / ネットワーク等）。同一内容での自動リトライは行わず、
// 新しい編集が入ったときだけ再試行する（失敗ループでサーバを叩き続けない）。
type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';

// エディタ上のブロック。type と内容を一致させた判別ユニオン（DB の Block に対応）。
export type EditorItem =
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
export const blockToItem = (block: Block, index: number): EditorItem => {
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
      const { name, title, pr, strengths, meta, company } = item;
      // strengths はエディタ上で改行区切り編集するため、保存時に空行を除去する
      return {
        type: 'profile',
        data: { name, title, pr, strengths: strengths.filter((s) => s.trim()), meta, company },
      };
    }
    case 'stats':
      return { type: 'stats', data: item.data };
    case 'project':
      return { type: 'project', data: item.data };
  }
};

// 1 ブロックを markdown 文字列へ（table/skills/experience は GFM 表・セクションへ変換）。
// includeHidden はバックアップ書き出し用（hidden な会社・案件も欠落させない）。
const itemToMarkdown = (item: EditorItem, opts?: { includeHidden?: boolean }): string => {
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
      const { name, title, pr, strengths, meta, company } = item;
      return profileBlockToMarkdown({ name, title, pr, strengths: strengths.filter((s) => s.trim()), meta, company });
    }
    case 'stats':
      return statsBlockToMarkdown(item.data);
    case 'project':
      return projectBlockToMarkdown(item.data, opts);
  }
};

// 連結規則はサーバ側 blocksToMarkdown と共有の blockJoinSeparator に一元化する。
// 手コピーで 2 箇所に規則が重複していたのを解消し、markdown 分割の無損失性と
// GFM テーブルが直前段落へ lazy continuation として飲み込まれない区切りを両立する。
export const assembleMarkdown = (items: EditorItem[], opts?: { includeHidden?: boolean }): string => {
  let result = '';
  let prev: EditorItem | undefined;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const markdown = itemToMarkdown(item, opts);
    // items[i - 1] を位置で参照すると sparse 配列（途中の undefined 要素）で
    // 実際に直前にレンダリングされたブロックを見失う。実際にレンダリングした
    // 直前アイテムを prev で追跡し、先頭要素の判定も prev の有無で行う。
    result += prev === undefined ? markdown : blockJoinSeparator(prev.type, item.type, markdown) + markdown;
    prev = item;
  }
  return result;
};

// dirty 比較用スナップショット（タイトル＋保存 payload と同形の構造化 BlockInput）。
// markdown 比較だと markdown に落ちないフィールド（profile.company / 会社 kind・note /
// 案件 comment・summary / hidden トグル等）の編集を取りこぼし、自動保存も
// beforeunload ガードも発火せず黙ってデータが失われるため、保存される構造化データで差分を見る。
// サーバ保存時に drop される空ブロックは除外する（案件エディタタブを開いただけの
// 空 project ブロック追加などで dirty / 幽霊自動保存を発生させない）。
const snapshot = (items: EditorItem[], title: string): string =>
  JSON.stringify([title, items.map(itemToBlockInput).filter((block) => !isBlockInputEmpty(block))]);

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
                    className="w-full min-w-24 rounded border border-input bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
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
                  <SelectOrCustom
                    value={s.level}
                    options={LEVEL_OPTIONS}
                    onChange={(v) => setSkill(i, 'level', v)}
                    placeholder="習熟度"
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
      <div className="flex items-center gap-1.5">
        <DateTokenPicker value={data.startDate} onChange={(v) => set('startDate', v)} placeholder="開始年月日" />
        <span className="text-muted-foreground text-xs">〜</span>
        <DateTokenPicker
          value={data.endDate}
          onChange={(v) => set('endDate', v)}
          placeholder="終了年月日"
          allowPresent
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

/** メタ情報（年齢/勤務形態/最寄り駅/学歴）の入力定義。 */
const PROFILE_META_FIELDS: { key: keyof ProfileMeta; label: string; placeholder: string }[] = [
  { key: 'age', label: '年齢', placeholder: '例: 30代前半' },
  { key: 'work', label: '勤務形態', placeholder: '例: フルリモート' },
  { key: 'station', label: '最寄り駅', placeholder: '例: 守山駅' },
  { key: 'education', label: '学歴', placeholder: '例: ○○大学卒' },
];

/** プロフィールブロックのインライン編集（name/title/company/pr/strengths/meta）。 */
const ProfileBlockEditor = ({
  data,
  onChange,
}: {
  data: ProfileBlockData;
  onChange: (data: ProfileBlockData) => void;
}) => {
  const set = <K extends keyof ProfileBlockData>(field: K, value: ProfileBlockData[K]) =>
    onChange({ ...data, [field]: value });
  const setMeta = (key: keyof ProfileMeta, value: string) => onChange({ ...data, meta: { ...data.meta, [key]: value } });

  return (
    <div className="min-w-0 flex-1 space-y-2 text-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">プロフィール</p>
      <div className="grid grid-cols-2 gap-2">
        <input
          value={data.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="名前（例: I・K）"
          aria-label="名前"
          className="rounded border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <input
          value={data.company ?? ''}
          onChange={(e) => set('company', e.target.value)}
          placeholder="所属会社（例: 株式会社 RITMO）"
          aria-label="所属会社"
          className="rounded border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <input
        value={data.title}
        onChange={(e) => set('title', e.target.value)}
        placeholder="肩書き（例: フルスタックエンジニア / EM）"
        aria-label="肩書き"
        className="w-full rounded border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <textarea
        value={data.pr}
        onChange={(e) => set('pr', e.target.value)}
        rows={3}
        placeholder="自己PR"
        aria-label="自己PR"
        className="w-full resize-y rounded border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div>
        <p className="mb-1 text-xs text-muted-foreground">強み（1行に1つ）</p>
        <textarea
          value={data.strengths.join('\n')}
          onChange={(e) => set('strengths', e.target.value.split('\n'))}
          rows={3}
          placeholder={'計測ベースのパフォーマンス改善\n開発基盤づくり'}
          aria-label="強み"
          className="w-full resize-y rounded border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {PROFILE_META_FIELDS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <p className="mb-1 text-xs text-muted-foreground">{label}</p>
            <input
              value={data.meta[key] ?? ''}
              onChange={(e) => setMeta(key, e.target.value)}
              placeholder={placeholder}
              aria-label={label}
              className="w-full rounded border border-input bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

const SortableBlock = ({
  item,
  onMarkdownChange,
  onTableChange,
  onSkillsChange,
  onExperienceChange,
  onProfileChange,
  onDelete,
}: {
  item: EditorItem;
  onMarkdownChange: (id: string, markdown: string) => void;
  onTableChange: (id: string, columns: TableColumn[], rows: string[][]) => void;
  onSkillsChange: (id: string, category: string, skills: SkillEntry[]) => void;
  onExperienceChange: (id: string, data: ExperienceBlockData) => void;
  onProfileChange: (id: string, data: ProfileBlockData) => void;
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
  const { mode, toggleTheme } = useThemeMode();
  const [items, setItems] = useState<EditorItem[]>(() => initialBlocks.map(blockToItem));
  // 案件エディタの選択中会社/案件（トップバー breadcrumb 表示用）
  const [projectCrumb, setProjectCrumb] = useState<ProjectEditorSelection | null>(null);
  const handleProjectSelectionChange = useCallback((selection: ProjectEditorSelection | null) => {
    setProjectCrumb(selection);
  }, []);
  const [title, setTitle] = useState(initialTitle);
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
  const autosaveStoppedRef = useRef(false);
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
      const res = await saveBlocksAction({
        title: currentTitle,
        blocks: currentItems.map(itemToBlockInput),
        sheetId: activeSheetId,
        expectedUpdatedAt: savedUpdatedAtRef.current,
      });
      if (res.ok) {
        savedRef.current = true;
        savedUpdatedAtRef.current = res.savedUpdatedAt ?? new Date();
        lastSavedSnapshotRef.current = savedSnapshot;
        failedSnapshotRef.current = null;
        // 保存中に入った編集分が残っていれば dirty のまま（追撃保存が拾う）。
        setIsDirty(snapshot(itemsRef.current, titleRef.current) !== savedSnapshot);
        setAutosaveStatus('saved');
      } else if (res.error === 'conflict') {
        // 競合は最初の 1 回で自動保存を恒久停止する（ダイアログは出さず、
        // トップバーのインジケータ＋再読み込みボタンで通知する）。
        autosaveStoppedRef.current = true;
        followUpRef.current = false;
        setAutosaveStatus('conflict');
      } else {
        // 失敗（unauthorized 等）は dirty のまま error にする。失敗したスナップショットを
        // 記録し、同一内容での自動リトライは行わない（新しい編集が入ったときだけ再試行）。
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
  }, [activeSheetId]);

  // dirty になってから AUTOSAVE_DEBOUNCE_MS 編集が止んだら自動保存する
  // （items/title が変わるたびにタイマーを引き直す＝デバウンス）。
  useEffect(() => {
    if (!isDirty || autosaveStatus === 'conflict') return;
    // 失敗直後の status 遷移（saving → error）だけでタイマーを再armしない。
    // 失敗時と同一内容のままなら再試行せず、新しい編集で snapshot が変わったときだけ再デバウンスする。
    if (autosaveStatus === 'error' && snapshot(items, title) === failedSnapshotRef.current) return;
    const timer = setTimeout(() => {
      void runAutosave();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [items, title, isDirty, autosaveStatus, runAutosave]);

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
    // バックアップは閲覧面ではないため hidden な会社・案件も含める
    // （黙って欠落させると、このバックアップからの復元で hidden データが失われる）。
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
    // 自動保存が実行中なら手動保存を開始しない（同じ expectedUpdatedAt を持つ 2 リクエストが
    // 競走して片方が誤 Conflict になる自己競合を防ぐ）。ボタンの disabled は次レンダーまで
    // 反映されないため、描画状態ではなく実行中フラグ自体をここで検査する。
    // 実行中に入った編集分は完了後の追撃自動保存が拾う。
    if (saveInFlightRef.current) {
      followUpRef.current = true;
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
      sheetId: activeSheetId,
      expectedUpdatedAt: savedUpdatedAtRef.current,
    };
    const savedSnapshot = snapshot(items, title);

    startSaving(async () => {
      // 手動保存も自動保存と同じ実行中フラグを共有し、同時保存（expectedUpdatedAt の
      // 取り違えによる誤 Conflict）を防ぐ。実行中の編集分は追撃自動保存が拾う。
      saveInFlightRef.current = true;
      try {
        const res = await saveBlocksAction(payload);
        if (res.ok) {
          savedRef.current = true;
          // A4: 次回の競合判定基準にはサーバーが返した updatedAt を使う。クライアント
          // 時計は使わない（サーバー時刻とズレると誤 Conflict を招くため）。返却が無い
          // 古い経路のみ new Date() にフォールバックする。
          savedUpdatedAtRef.current = res.savedUpdatedAt ?? new Date();
          // 保存成功した内容をスナップショットとして記録し、dirty を解除する
          // （保存中に編集が入っていた場合は dirty のままにする）。
          lastSavedSnapshotRef.current = savedSnapshot;
          setIsDirty(snapshot(itemsRef.current, titleRef.current) !== savedSnapshot);
          setAutosaveStatus('idle');
          toast.success('保存しました');
        } else if (res.error === 'unauthorized') {
          toast.error('セッションが切れました。再度認証してください。');
        } else if (res.error === 'conflict') {
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
      : isSaving || autosaveStatus === 'saving'
        ? { label: '保存中…', dotClass: 'bg-[#d4a017]', textClass: 'text-faint' }
        : autosaveStatus === 'error'
          ? { label: '自動保存に失敗 — 保存ボタンで再試行', dotClass: 'bg-destructive', textClass: 'text-destructive' }
          : isDirty
            ? { label: '未保存の変更', dotClass: 'bg-[#d4a017]', textClass: 'text-faint' }
            : autosaveStatus === 'saved'
              ? { label: '保存済み（自動）', dotClass: 'bg-accent-text', textClass: 'text-faint' }
              : null;

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
        <div
          className={`mx-auto flex h-16 items-center justify-between gap-2 px-4 sm:px-6 ${
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
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="sm" onClick={handleOpenPreview} aria-label="プレビューを別ウィンドウで開く">
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
                    className="ml-1 h-6 px-2 text-[11px]"
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
            <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={handleExport}>
              <Download className="mr-1.5 size-4" />
              バックアップ
            </Button>
            <Link
              href="/view"
              className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
              onClick={(e) => {
                // クライアント遷移では beforeunload が発火しないため、dirty 時はここで確認する
                if (!confirmDiscardChanges()) e.preventDefault();
              }}
            >
              閲覧へ
            </Link>
            {/* 自動保存の実行中も無効化し、同時保存（expectedUpdatedAt 取り違えの誤 Conflict）を防ぐ */}
            <Button
              onClick={handleSave}
              disabled={isSaving || autosaveStatus === 'saving'}
              aria-label={isSaving ? '保存中' : '保存'}
            >
              <Save className="size-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{isSaving ? '保存中...' : '保存'}</span>
            </Button>
          </div>
        </div>
      </header>

      {/* プレビューは別ウィンドウに分離（ヘッダーの「プレビュー」ボタンで開く）。
          案件エディタタブは 3 ペイン（ナビ/フォーム/プレビュー）を持つため全幅にする。 */}
      <div className={`mx-auto px-4 py-6 sm:px-6 ${activeTab === 'project' ? 'max-w-none' : 'max-w-5xl'}`}>
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
                    onClick={() => {
                      if (sheet.id === activeSheetId) return;
                      // シート切替は key={activeSheetId} の再マウントで編集中 state を破棄する
                      if (!confirmDiscardChanges()) return;
                      router.push(`/builder?sheet=${sheet.id}`);
                    }}
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
                <ProjectEditor
                  data={projectItem?.data ?? { companies: [], items: [] }}
                  onChange={updateProjectData}
                  onSelectionChange={handleProjectSelectionChange}
                />
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
                        onProfileChange={updateProfile}
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
      </div>
    </div>
  );
};

export default BuilderClient;
