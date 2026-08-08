'use client';

import type { ProfileBlockData } from '@skillsheet/db/blocks';
import { useState } from 'react';

interface ProfileIntroProps {
  data: ProfileBlockData;
}

// 375pxで日本語1行≒22文字 × 4行
const SP_PR_CLAMP_THRESHOLD = 88;

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
  const [expanded, setExpanded] = useState(false);
  const metaEntries = (Object.entries(data.meta) as [string, string | undefined][]).filter(
    ([, v]) => v && v.trim().length > 0,
  );
  const showClampToggle = !!data.pr && data.pr.length >= SP_PR_CLAMP_THRESHOLD;

  return (
    // design は区切り線を持たず、親の 48px 間隔だけで次のセクションと分ける。
    // SP はメタ→強み→自己PRの順に並べ替えるため flex-col + order-* を使う。
    <section className="flex flex-col gap-4">
      <div className="order-1 flex flex-col gap-1">
        {/* kicker: 「SKILL SHEET · 会社名」。会社名未設定時は「SKILL SHEET」のみ。 */}
        <p className="kicker mb-1.5">{data.company ? `SKILL SHEET · ${data.company}` : 'SKILL SHEET'}</p>
        {data.name && (
          <h1 className="text-[26px] font-bold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-[34px]">
            {data.name}
          </h1>
        )}
        {data.title && <p className="font-mono text-[14.5px] text-accent-text">{data.title}</p>}
      </div>

      {/* 自己PR は段落を改行で区切って保存されるため、pre-line で改行を保持する */}
      {data.pr && (
        <>
          <p
            // line-clamp は SP 専用（sm 以上は続きを読むボタンを出さないため、常に全文表示に戻す）。
            className={`order-4 max-w-[720px] whitespace-pre-line text-sm leading-[1.95] text-foreground/80 sm:order-2 sm:line-clamp-none ${
              !expanded ? 'line-clamp-4' : ''
            }`}
          >
            {data.pr}
          </p>
          {showClampToggle && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="order-5 -mt-2 self-start text-xs font-medium text-accent-text sm:hidden"
            >
              {expanded ? '折りたたむ' : '続きを読む'}
            </button>
          )}
        </>
      )}

      {data.strengths.length > 0 && (
        <ul className="order-3 flex flex-wrap gap-2">
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
        // SP は2列グリッド、sm 以上は1行フレックスに戻す。
        <dl className="order-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs text-faint sm:order-4 sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-[18px]">
          {metaEntries.map(([key, value], i) => (
            <div key={key} className="flex items-baseline gap-1.5">
              {i > 0 && (
                <span aria-hidden className="hidden sm:inline">
                  ·
                </span>
              )}
              <dt>{META_LABELS[key] ?? key}</dt>
              <dd className="text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
};
