'use client';

import type { ProfileBlockData } from '@skillsheet/db/blocks';

interface ProfileIntroProps {
  data: ProfileBlockData;
}

const META_LABELS: Record<string, string> = {
  age: '年齢',
  work: '勤務形態',
  station: '最寄り駅',
  education: '学歴',
};

export const ProfileIntro = ({ data }: ProfileIntroProps) => {
  const metaEntries = (Object.entries(data.meta) as [string, string | undefined][]).filter(
    ([, v]) => v && v.trim().length > 0,
  );

  return (
    <section className="mb-8 border-b border-border pb-8">
      <div className="flex flex-col gap-1">
        {data.name && (
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{data.name}</h1>
        )}
        {data.title && (
          <p className="text-lg font-medium text-primary">{data.title}</p>
        )}
      </div>

      {data.pr && (
        <p className="mt-4 leading-relaxed text-foreground/80">{data.pr}</p>
      )}

      {data.strengths.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">強み</p>
          <ul className="flex flex-wrap gap-2">
            {data.strengths.map((s, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 静的リスト
              <li key={i} className="rounded bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {metaEntries.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
          {metaEntries.map(([key, value]) => (
            <div key={key} className="flex flex-col">
              <dt className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {META_LABELS[key] ?? key}
              </dt>
              <dd className="text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
};
