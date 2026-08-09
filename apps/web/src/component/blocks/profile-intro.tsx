'use client';

import { orderedProfileMetaEntries, type ProfileBlockData, resolveProfileMetaLabel } from '@skillsheet/db/blocks';

interface ProfileIntroProps {
  data: ProfileBlockData;
}

export const ProfileIntro = ({ data }: ProfileIntroProps) => {
  // 既知8項目 → それ以外の任意項目、の順で並べる（packages/db/src/blocks.ts と共有。
  // markdown/PDF 変換の並び順ともここで揃う。Issue #193）。
  const metaEntries = orderedProfileMetaEntries(data.meta);

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
        // design は「年齢 28歳 · 勤務形態 フルリモート · …」の1行。2段組の定義リストはやめる。
        <dl className="mt-[18px] flex flex-wrap items-baseline gap-x-[18px] gap-y-1 font-mono text-xs text-faint">
          {metaEntries.map(([key, value], i) => (
            <div key={key} className="flex items-baseline gap-1.5">
              {i > 0 && <span aria-hidden>·</span>}
              <dt>{resolveProfileMetaLabel(key)}</dt>
              <dd className="text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
};
