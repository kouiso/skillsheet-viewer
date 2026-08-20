'use client';

import type { SkillsBlockData } from '@skillsheet/db/blocks';
import { sanitizeHtml } from '@/util/sanitize-html';

interface SkillMatrixProps {
  data: SkillsBlockData;
  className?: string;
}

const LEVEL_WIDTH: Record<string, string> = {
  '★★★': 'w-full',
  '★★☆': 'w-2/3',
  '★☆☆': 'w-1/3',
  上級: 'w-full',
  中級: 'w-2/3',
  初級: 'w-1/3',
};

function getLevelWidth(level: string): string {
  return LEVEL_WIDTH[level] ?? 'w-1/2';
}

// 経験年数からバー幅を算出する（8年で上限クランプ、下限フロア8%で小さい正の値も潰れない）。
function getYearsBarPercent(years: number): number {
  const ratio = Math.min(years / 8, 1);
  return Math.max(ratio * 100, 8);
}

export const SkillMatrix = ({ data, className = 'mb-6' }: SkillMatrixProps) => {
  if (data.skills.length === 0) return null;

  return (
    <div className={className}>
      {data.category && (
        // design の見出しは「名前 — 罫線 — 件数」。kicker（ティールの英字）はページ見出し専用。
        <div className="mb-3 flex items-center gap-3">
          <h3 className="text-[15px] font-semibold text-foreground">{data.category}</h3>
          <span className="h-px flex-1 bg-border" />
          <span className="font-mono text-[11px] text-faint">{data.skills.length}</span>
        </div>
      )}
      <div className="grid gap-y-[11px]">
        {data.skills.map((skill, i) => (
          // 名前 / 習熟度(★) / バー / 年数 の4列。習熟度は PDF（表形式）と同じ情報量になるよう、
          // ホバー不要で常時可視のテキストとして表示する（issue #142）。
          // 名前列は truncate（1行省略）だと 320px 幅で実効幅が約50pxまで縮み、
          // 一般的な技術名すら読めなくなる（issue #197）。items-center → items-start は
          // 折り返しが発生しない限り単一行時の見た目に影響しない（行高＝内容高のため）。
          // biome-ignore lint/suspicious/noArrayIndexKey: 静的リスト
          <div key={i} className="grid grid-cols-[1fr_44px_84px_28px] items-start gap-3">
            <span className="min-w-0 break-words text-sm text-foreground" title={sanitizeHtml(skill.name)}>
              {sanitizeHtml(skill.name)}
            </span>
            <span className="truncate text-center text-xs text-foreground" title={skill.level}>
              {skill.level}
            </span>
            <span className="barTrack" title={skill.level}>
              {skill.years > 0 ? (
                <span className="barFill block" style={{ width: `${getYearsBarPercent(skill.years)}%` }} />
              ) : (
                // 年数が無いスキルは ★ の段階でバー幅を決める。
                <span className={`barFill block ${getLevelWidth(skill.level)}`} />
              )}
            </span>
            <span className="text-right font-mono text-xs text-foreground">
              {skill.years > 0 ? (
                <>
                  {skill.years}
                  <span className="text-[11px] text-faint">y</span>
                </>
              ) : (
                <span className="text-faint">—</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
