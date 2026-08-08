'use client';

import type { ProfileBlockData } from '@skillsheet/db/blocks';

interface ProfileIntroProps {
  data: ProfileBlockData;
}

const META_LABELS: Record<string, string> = {
  age: '年齢',
  gender: '性別',
  qualifications: '資格',
  education: '学歴',
  work: '勤務形態',
  station: '最寄り駅',
  specialties: '得意分野',
  expertise: '得意業務',
};

export const ProfileIntro = ({ data }: ProfileIntroProps) => {
  const metaEntries = (Object.entries(data.meta) as [string, string | undefined][]).filter(
    ([, v]) => v && v.trim().length > 0,
  );

  return (
    // design は区切り線を持たず、親の 48px 間隔だけで次のセクションと分ける。
    <section>
      <div className="flex flex-col gap-1">
        {/* kicker: 「SKILL SHEET · 会社名」。会社名未設定時は「SKILL SHEET」のみ。 */}
        <p className="kicker mb-1.5">{data.company ? `SKILL SHEET · ${data.company}` : 'SKILL SHEET'}</p>
        {data.name && (
          <h1 className="text-[34px] font-bold leading-[1.1] tracking-[-0.02em] text-foreground">{data.name}</h1>
        )}
        {data.title && <p className="font-mono text-[14.5px] text-accent-text">{data.title}</p>}
      </div>

      {/* 自己PR は段落を改行で区切って保存されるため、pre-line で改行を保持する */}
      {data.pr && (
        <p className="mt-4 max-w-[720px] whitespace-pre-line text-sm leading-[1.95] text-foreground/80">{data.pr}</p>
      )}

      {data.strengths.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {data.strengths.map((s, i) => (
            // 押せない紹介ラベルなので .techtag。
            // biome-ignore lint/suspicious/noArrayIndexKey: 静的リスト
            <li key={i} className="techtag">
              {s}
            </li>
          ))}
        </ul>
      )}

      {metaEntries.length > 0 && (
        // SP では 2 列グリッドで折り返しを抑え、sm 以上で 1 行のラベルリストに戻す。
        <dl className="mt-[18px] grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-xs text-faint sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-[18px] sm:gap-y-1">
          {metaEntries.map(([key, value], i) => (
            <div key={key} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-1.5">
              <span className="hidden sm:inline" aria-hidden={i === 0}>
                {i > 0 && <span aria-hidden>·</span>}
              </span>
              <dt>{META_LABELS[key] ?? key}</dt>
              <dd className="text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
};
