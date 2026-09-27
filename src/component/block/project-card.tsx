'use client';

import { type ReactNode, useState } from 'react';
import type { ProjectItem } from '@/db/block';
import { resolveDuration } from '@/db/duration';
import {
  flattenTech,
  formatPeriodDisplay,
  normalizeProcess,
  TECH_BUCKET_LABELS,
  TECH_BUCKET_ORDER,
} from '@/db/process';
import { sanitizeHtml } from '@/db/sanitize-html';
import { resolveProjectArea } from '@/db/tech-area';
import { collapseSoftBreaks } from '@/db/text';
import { formatTeamSize } from '@/util/format-team-size';
import { InlineMarkdown } from '../inline-markdown';
import { ProcessStepper } from './process-stepper';
import { techMatchesQuery } from './project-search';

const COMMENT_PREVIEW_PARAS = 2;

export function splitCommentParagraphs(comment: string): string[] {
  return comment
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean);
}

interface ProjectCardProps {
  item: ProjectItem;
  /** 稼働月数の基準月（YYYY*12+M-1 の連番）。呼出側で固定して描画を決定的にする。 */
  referenceMonth?: number;
  /** フィルタ前の全件配列基準の通し番号。絞り込んでも変わらない。 */
  no: number;
  /** メタ行に出す会社名。CompanySection の見出しと同じ表示名を渡す。 */
  companyName?: string;
  /** ハイライト対象の技術（TechFilterで選択中のチップ）。 */
  activeTech: string[];
  /** flattenTech 済みの技術一覧。 */
  tech: string[];
  /** 検索クエリ語。一致チップ強調に使う（activeTech が空でも効く）。 */
  queryTerms?: string[];
  /** 稼働月数（メタ行の末尾要素）を出すか。ビュートグル「稼働月数」に従う。既定 true。 */
  showDuration?: boolean;
}

function CardBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <span className="text-[12px] leading-normal text-muted-foreground">{label}</span>
      {/* 他の本文（会社 note 等）は 72ch 制限があるため、カード本文も揃える（#355）。
          ~100字/行は長文の行追跡を難しくする。 */}
      <div className="max-w-[72ch]">{children}</div>
    </div>
  );
}

export const ProjectCard = ({
  item,
  no,
  companyName,
  activeTech,
  tech,
  queryTerms = [],
  showDuration = true,
  referenceMonth,
}: ProjectCardProps) => {
  const [commentOpen, setCommentOpen] = useState(false);
  const normalized = normalizeProcess(item.process);
  // PDF と同じ判定（resolveDuration: 手入力 duration 優先、基準月は呼出側で固定）。
  // トグル OFF では出さない。
  const duration = showDuration ? sanitizeHtml(resolveDuration(item.period, item.duration, referenceMonth).label) : '';
  // 概要（summary）と担当業務（duties）は別項目。`summary || duties` のフォールバックだと
  // 両方入っている実データで duties がどこにも出ないため、独立した節として並べる。
  const summary = item.summary?.trim() || '';
  const duties = item.duties.trim();
  const area = resolveProjectArea(item.scope, item.tech);
  const periodDisplay = formatPeriodDisplay(item.period);
  const roleText = item.role?.trim() ? sanitizeHtml(item.role) : '';
  // 役割・会社・人数・期間は1行のメタ行に畳む（#289/#290）。以前は見出しを左右2枠にして
  // 役割だけを右枠へ置いていた頃は、タイトルが長い案件で右枠が折り返されて役割の位置が
  // ずれた。その後のラベル列（dl）でも役割列の左端は期間列の幅に依存し、同じく案件ごとに
  // ずれていた。行頭がカード左端で固定される1行なら位置が構造的に揃う。
  const metaParts = [
    roleText,
    companyName?.trim() ? sanitizeHtml(companyName) : '',
    item.team?.trim() ? formatTeamSize(item.team) : '',
    duration,
  ].filter(Boolean);
  const commentParas = splitCommentParagraphs(item.comment);
  const hasMoreComment = commentParas.length > COMMENT_PREVIEW_PARAS;
  const commentBody =
    commentOpen || !hasMoreComment ? item.comment : commentParas.slice(0, COMMENT_PREVIEW_PARAS).join('\n\n');
  const remainingParas = Math.max(commentParas.length - COMMENT_PREVIEW_PARAS, 0);
  const processOn = normalized.done.some(Boolean) || normalized.other.length > 0;
  const techGroups = TECH_BUCKET_ORDER.map((key) => ({
    key,
    label: TECH_BUCKET_LABELS[key],
    values: (item.tech?.[key] ?? []).filter(
      (value) => typeof value === 'string' && value.trim() && !['-', 'ー', '—'].includes(value.trim()),
    ),
  })).filter((group) => group.values.length > 0);
  const flatTech = tech.length > 0 ? tech : flattenTech(item.tech);

  const chipHit = (name: string) => activeTech.includes(name) || techMatchesQuery(name, queryTerms);

  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-card px-[22px] py-5 shadow-elevation-2">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="rounded-[var(--radius)] bg-primary-dark px-1.5 py-px font-mono text-[12px] text-on-accent">
              {String(no).padStart(2, '0')}
            </span>
            <span className="font-mono text-[12px] text-muted-foreground">{periodDisplay || '—'}</span>
          </div>
          <h3 className="text-[17px] leading-snug text-foreground">{sanitizeHtml(item.title) || '(タイトル未入力)'}</h3>
          {area.text && (
            <p className="text-[12px] text-muted-foreground">
              {area.derived && <span className="kicker mr-1.5">技術領域</span>}
              {sanitizeHtml(area.text)}
            </p>
          )}
        </div>
        {/* 役割が空の案件では「役割」ラベル自体を出さない（#289 完了条件）。
            他の項目が空ならその部分だけを落とし、全部空なら行ごと出さない。 */}
        {metaParts.length > 0 && (
          <p className="m-0 font-mono text-[12px] leading-normal text-muted-foreground [overflow-wrap:anywhere]">
            {roleText && <span className="kicker mr-1.5">役割</span>}
            {/* 採用側が最重視する「この案件で何をしたか（役割）」をメタ行で最も弱い
                階層にしない。役割部分だけ前景色で示す（#355）。 */}
            {roleText ? (
              <>
                <span className="font-medium text-foreground">{roleText}</span>
                {metaParts.length > 1 && ` · ${metaParts.slice(1).join(' · ')}`}
              </>
            ) : (
              metaParts.join(' · ')
            )}
          </p>
        )}
      </div>

      {summary ? (
        <CardBlock label="概要">
          <InlineMarkdown
            content={collapseSoftBreaks(summary)}
            className="break-words text-[13.5px] leading-[1.85] text-foreground"
          />
        </CardBlock>
      ) : null}

      {duties ? (
        <CardBlock label="担当業務">
          <InlineMarkdown
            content={collapseSoftBreaks(duties)}
            className="break-words text-[13.5px] leading-[1.85] text-foreground"
          />
        </CardBlock>
      ) : null}

      {item.acquired ? (
        <CardBlock label="習得スキル">
          <InlineMarkdown
            content={collapseSoftBreaks(item.acquired)}
            className="break-words text-[13.5px] leading-relaxed text-foreground"
          />
        </CardBlock>
      ) : null}

      {item.comment ? (
        <CardBlock label="コメント">
          <InlineMarkdown
            content={collapseSoftBreaks(commentBody)}
            className="whitespace-pre-line break-words text-[13.5px] leading-relaxed text-foreground"
          />
          {hasMoreComment ? (
            <button
              type="button"
              className="softbtn compact self-start"
              aria-expanded={commentOpen}
              onClick={() => setCommentOpen((open) => !open)}
            >
              {commentOpen ? '閉じる' : `続きを読む（残り ${remainingParas}）`}
            </button>
          ) : null}
        </CardBlock>
      ) : null}

      {processOn ? (
        <CardBlock label="担当工程">
          <ProcessStepper done={normalized.done} />
          {normalized.other.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              <span className="kicker self-center">その他の役割</span>
              {normalized.other.map((role) => (
                <span key={role} className="techtag">
                  {role}
                </span>
              ))}
            </div>
          ) : null}
        </CardBlock>
      ) : null}

      {techGroups.length > 0 ? (
        <CardBlock label="技術スタック">
          <div className="flex flex-col gap-2.5">
            {techGroups.map((group) => (
              <div
                key={group.key}
                className="grid grid-cols-1 items-baseline gap-1.5 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-x-3.5"
              >
                <span className="text-[12px] leading-normal text-muted-foreground">{group.label}</span>
                <div className="flex min-w-0 flex-wrap gap-1.5">
                  {group.values.map((name) => (
                    <span key={name} className={`techtag ${chipHit(name) ? 'hit' : ''}`}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardBlock>
      ) : flatTech.length > 0 ? (
        <CardBlock label="技術スタック">
          <div className="flex flex-wrap gap-1.5">
            {flatTech.map((name) => (
              <span key={name} className={`techtag ${chipHit(name) ? 'hit' : ''}`}>
                {name}
              </span>
            ))}
          </div>
        </CardBlock>
      ) : null}
    </article>
  );
};
