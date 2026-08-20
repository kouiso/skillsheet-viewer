'use client';

import type { SkillEntry } from '@skillsheet/db/blocks';
import { Plus, Trash2 } from 'lucide-react';
import { SelectOrCustom } from '@/components/select-or-custom';

const LEVEL_OPTIONS = ['実務経験あり', '設計可能', '指導可能', '基礎知識のみ'];

export const SkillsBlockEditor = ({
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
        className="w-full min-h-11 rounded border border-input bg-background px-2 py-1 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
      />
      {/* w-full だけだと table-layout:auto がコンテナ幅に収めようと各列を圧縮し、320px では
          「経験年数」ヘッダーが1文字ずつ縦積みになっていた（#150）。min-w を与えてテーブル自体を
          コンテナよりワイドにし、overflow-x-auto の横スクロールを実際に発火させる。 */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
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
                    placeholder="スキル名（例: TypeScript）"
                    aria-label={`スキル${i + 1}の名称`}
                    className="w-full min-h-11 min-w-24 rounded border border-input bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
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
                    className="w-full min-h-11 rounded border border-input bg-background px-2 py-1 text-center focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </td>
                <td className="border border-border p-1">
                  <SelectOrCustom
                    value={s.level}
                    options={LEVEL_OPTIONS}
                    onChange={(v) => setSkill(i, 'level', v)}
                    placeholder="習熟度"
                    label={`スキル${i + 1}の習熟度`}
                  />
                </td>
                <td className="border border-border p-1 text-center">
                  <button
                    type="button"
                    onClick={() => removeSkill(i)}
                    aria-label={`スキル${i + 1}を削除`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
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
        className="inline-flex h-11 items-center gap-1 rounded px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Plus className="size-4" />
        スキルを追加
      </button>
    </div>
  );
};
