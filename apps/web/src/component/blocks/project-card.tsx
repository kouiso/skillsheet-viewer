'use client';

import type { ProjectItem } from '@skillsheet/db/blocks';
import {
  deriveDuration,
  flattenTech,
  formatPeriodDisplay,
  normalizeProcess,
  TECH_BUCKET_LABELS,
  TECH_BUCKET_ORDER,
} from '@skillsheet/db/process';
import { resolveProjectArea } from '@skillsheet/db/tech-area';
import { type ReactNode, useState } from 'react';
import { formatTeamSize } from '@/util/format-team-size';
import { sanitizeHtml } from '@/util/sanitize-html';
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
  /** フィルタ前の全件配列基準の通し番号。絞り込んでも変わらない。 */
  no: number;
  /** ハイライト対象の技術（TechFilterで選択中のチップ）。 */
  activeTech: string[];
  /** flattenTech 済みの技術一覧。 */
  tech: string[];
  /** 検索クエリ語。一致チップ強調に使う（activeTech が空でも効く）。 */
  queryTerms?: string[];
}

function CardBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-4">
      <span className="text-[12px] leading-normal text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export const ProjectCard = ({ item, no, activeTech, tech, queryTerms = [] }: ProjectCardProps) => {
  const [commentOpen, setCommentOpen] = useState(false);
  const normalized = normalizeProcess(item.process);
  const duration = sanitizeHtml(item.duration?.trim() || deriveDuration(item.period));
  const summary = item.summary?.trim() || item.duties;
  const area = resolveProjectArea(item.scope, item.tech);
  const periodDisplay = formatPeriodDisplay(item.period);
  const periodValue = periodDisplay ? (duration ? `${periodDisplay}（${duration}）` : periodDisplay) : '—';
  const roleValue = item.role?.trim() ? sanitizeHtml(item.role) : '—';
  const teamValue = item.team?.trim() ? formatTeamSize(item.team) : '—';
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
    <article className="flex min-w-0 flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-card px-[22px] py-5 transition-colors duration-150 hover:border-primary">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="rounded-[var(--radius)] bg-primary-dark px-1.5 py-px font-mono text-[11px] text-on-accent">
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
        <dl className="m-0 flex flex-wrap gap-x-7 gap-y-3">
          {[
            { label: '期間', value: periodValue },
            { label: '役割', value: roleValue },
            { label: 'チーム規模', value: teamValue },
          ].map((fact) => (
            <div key={fact.label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-[12px] leading-normal text-muted-foreground">{fact.label}</dt>
              <dd className="m-0 text-[13.5px] leading-normal text-foreground [overflow-wrap:anywhere]">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {summary ? (
        <CardBlock label="担当業務">
          <InlineMarkdown content={summary} className="break-words text-[13.5px] leading-[1.85] text-foreground" />
        </CardBlock>
      ) : null}

      {item.acquired ? (
        <CardBlock label="習得スキル">
          <InlineMarkdown content={item.acquired} className="break-words leading-relaxed text-foreground" />
        </CardBlock>
      ) : null}

      {item.comment ? (
        <CardBlock label="コメント">
          <InlineMarkdown
            content={commentBody}
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
