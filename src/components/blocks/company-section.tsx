'use client';

import type { ReactNode } from 'react';
import type { CompanyInfo } from '@/db/blocks';
import { deriveDuration } from '@/db/process';
import { collapseSoftBreaks } from '@/db/text';
import { sanitizeHtml } from '@/util/sanitize-html';
import { InlineMarkdown } from '../inline-markdown';
import { CompanyLane } from './company-lane';

export interface CompanyLaneItem {
  no: number;
  period: string;
  duration: string;
}

interface CompanySectionProps {
  id: string;
  company: CompanyInfo | undefined;
  /** 検索前の会社配下の案件数。 */
  totalCount: number;
  /** 検索後にこのセクションで見えている案件数。 */
  visibleCount: number;
  /** 検索中か（件数表示を「一致 N / 案件 M 件」にするか「案件 M 件」にするかの分岐）。 */
  searching: boolean;
  /** レーン図に渡す案件一覧。検索中は絞り込み後、検索していないときは全件（呼び出し側で決める）。 */
  laneItems: CompanyLaneItem[];
  /** 配下の ProjectCard 一覧（呼び出し側で番号・ハイライトを解決済みのまま渡す）。 */
  children: ReactNode;
}

// 個人開発は「在籍」という言葉が実態と合わないため在籍期間・レーンを出さない
// （プラン: 「同じ会社の中での移動」は在籍のある参画先だけの話）。
const NO_TENURE_KIND = '個人開発';

/**
 * 会社1件分のセクション。会社見出しは sticky にして、長いカード一覧をスクロールしても
 * 「いまどの会社を見ているか」を保つ。会社概要文（company.note）はここで1回だけ描画する
 * （従来 ProjectCard 側で所属案件ごとに再掲されていたのを解消：見づらさの原因の1つ）。
 */
export function CompanySection({
  id,
  company,
  totalCount,
  visibleCount,
  searching,
  laneItems,
  children,
}: CompanySectionProps) {
  const name = company?.name?.trim() || '(不明な会社)';
  const kind = company?.kind?.trim() ?? '';
  const period = company?.period?.trim() ?? '';
  const note = company?.note?.trim() ?? '';
  const showTenure = !!period && kind !== NO_TENURE_KIND;
  const tenureLength = showTenure ? deriveDuration(period) : '';
  const countLabel = searching ? `一致 ${visibleCount} / 案件 ${totalCount} 件` : `案件 ${totalCount} 件`;
  const showLane = kind !== NO_TENURE_KIND && laneItems.length >= 2 && !!period;

  return (
    <section id={id} aria-label={period ? `${name}（${period}）` : name} className="flex flex-col gap-4 scroll-mt-20">
      {/* topbar（sticky top-0 z-40）の下に潜らないよう top-16（既存の目次と同じオフセット）。
          topbar の実測高さが変わった場合はここも合わせて調整する（実機確認手順参照）。 */}
      <div
        className="sticky top-16 z-20 flex flex-wrap items-baseline gap-x-3.5 gap-y-1 bg-background py-2.5 shadow-[var(--sticky-shadow,0_8px_14px_-12px_rgba(16,23,26,0.35))]"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h2 className="text-[19px] font-semibold leading-snug text-foreground text-pretty">{sanitizeHtml(name)}</h2>
        {kind && (
          <span
            className="whitespace-nowrap rounded text-[11px] leading-relaxed"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)', padding: '2px 8px' }}
          >
            {sanitizeHtml(kind)}
          </span>
        )}
        {showTenure && (
          <span className="whitespace-nowrap font-mono text-[12px] leading-relaxed text-foreground">
            在籍 {period}
            {tenureLength && `（${tenureLength}）`}
          </span>
        )}
        <span className="whitespace-nowrap font-mono text-[12px] leading-relaxed text-muted-foreground">
          {countLabel}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        {note && (
          <InlineMarkdown
            content={collapseSoftBreaks(note)}
            className="max-w-[72ch] text-[15px] leading-[1.8] text-foreground text-pretty"
          />
        )}
        {showLane && <CompanyLane companyPeriod={period} items={laneItems} />}
      </div>

      <div className="flex flex-col gap-5">{children}</div>
    </section>
  );
}
