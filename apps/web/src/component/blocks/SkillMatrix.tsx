'use client';

import type { SkillsBlockData } from '@skillsheet/db/blocks';

interface SkillMatrixProps {
  data: SkillsBlockData;
}

const LEVEL_WIDTH: Record<string, string> = {
  '★★★': 'w-full',
  '★★☆': 'w-2/3',
  '★☆☆': 'w-1/3',
  '上級': 'w-full',
  '中級': 'w-2/3',
  '初級': 'w-1/3',
};

function getLevelWidth(level: string): string {
  return LEVEL_WIDTH[level] ?? 'w-1/2';
}

export const SkillMatrix = ({ data }: SkillMatrixProps) => {
  if (data.skills.length === 0) return null;

  return (
    <div className="mb-6">
      {data.category && (
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          {data.category}
        </h3>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {data.skills.map((skill, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 静的リスト
          <div key={i} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-sm text-foreground">{skill.name}</span>
            <div className="flex-1">
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div className={`h-1.5 rounded-full bg-primary ${getLevelWidth(skill.level)}`} />
              </div>
            </div>
            <span className="w-12 shrink-0 text-right text-xs text-muted-foreground">
              {skill.years > 0 ? `${skill.years}年` : '-'}
            </span>
            <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">{skill.level}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
