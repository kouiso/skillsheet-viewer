'use client';

import type { SkillsBlockData } from '@skillsheet/db/blocks';

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
      {data.category && <h3 className="kicker mb-3">{data.category}</h3>}
      <div className="grid gap-2.5">
        {data.skills.map((skill, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 静的リスト
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm text-foreground">{skill.name}</span>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {skill.years > 0 ? `${skill.years}年` : '-'} {skill.level}
              </span>
            </div>
            {skill.years > 0 ? (
              <div className="barTrack">
                <div className="barFill" style={{ width: `${getYearsBarPercent(skill.years)}%` }} />
              </div>
            ) : (
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div className={`h-1.5 rounded-full bg-primary ${getLevelWidth(skill.level)}`} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
