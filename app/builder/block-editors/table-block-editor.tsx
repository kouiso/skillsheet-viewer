'use client';

import { AlignCenter, AlignLeft, AlignRight, Plus, Trash2 } from 'lucide-react';
import type { TableAlign, TableColumn } from '@/db/blocks';

const ALIGN_OPTIONS: { value: TableAlign; Icon: typeof AlignLeft; label: string }[] = [
  { value: 'left', Icon: AlignLeft, label: '左揃え' },
  { value: 'center', Icon: AlignCenter, label: '中央揃え' },
  { value: 'right', Icon: AlignRight, label: '右揃え' },
];

// Excel 風グリッド編集の中心。ヘッダ=列 label 入力＋列 align トグル、本文=セルごと <input>。
// セルは <input> なので入力時に改行が混入しない（GFM 表崩れ・PDF の改行欠落を回避）。
export const TableBlockEditor = ({
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
                    className="w-full min-h-11 min-w-24 rounded border border-input bg-background px-2 py-1 font-medium focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <div className="flex items-center gap-2">
                    {ALIGN_OPTIONS.map(({ value, Icon, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setAlign(ci, value)}
                        aria-label={`列${ci + 1}を${label}`}
                        aria-pressed={col.align === value}
                        className={`inline-flex h-11 w-11 items-center justify-center rounded ${
                          // bg-primary は白文字と組むとライトテーマで 3.74:1 と AA 未達（Issue #198）。
                          // ボタン背景は button.tsx と同じく --primary-dark を使う。
                          col.align === value
                            ? 'bg-primary-dark text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        <Icon className="size-4" />
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => removeColumn(ci)}
                      disabled={columns.length <= 1}
                      aria-label={`列${ci + 1}を削除`}
                      className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded text-muted-foreground hover:text-destructive disabled:opacity-30"
                    >
                      <Trash2 className="size-4" />
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
                className="inline-flex h-11 w-11 items-center justify-center rounded text-muted-foreground hover:text-foreground"
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
                    className="w-full min-h-11 min-w-24 rounded border border-input bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </td>
              ))}
              <td className="border border-border p-1 text-center align-middle">
                <button
                  type="button"
                  onClick={() => removeRow(ri)}
                  aria-label={`${ri + 1}行目を削除`}
                  className="inline-flex h-11 w-11 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={addRow}
        className="mt-1 inline-flex h-11 items-center gap-1 rounded px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Plus className="size-4" />
        行を追加
      </button>
    </div>
  );
};
