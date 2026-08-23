'use client';

import { useState } from 'react';
import type { ProjectItem } from '@/db/blocks';
import { deriveDuration, formatPeriodDisplay, normalizeProcess } from '@/db/process';
import { resolveProjectArea } from '@/db/tech-area';
import { collapseSoftBreaks } from '@/db/text';
import { formatTeamSize } from '@/util/format-team-size';
import { sanitizeHtml } from '@/util/sanitize-html';
import { InlineMarkdown } from '../inline-markdown';
import { ProcessStepper } from './process-stepper';

interface ProjectCardProps {
  item: ProjectItem;
  /** フィルタ前の全件配列基準の通し番号。絞り込んでも変わらない。 */
  no: number;
  /** ハイライト対象の技術（TechFilterで選択中のチップ）。 */
  activeTech: string[];
}

// ProjectTech の6バケットの表示ラベル。flattenTech と同じ固定順で並べる。
// app/builder/editor-constants.ts の TECH_CATEGORIES と同じラベル文言に揃える
// （エディタ側の入力カテゴリ名と閲覧側の表示名が食い違うと、同じ技術が
// 画面ごとに違う分類名で見えることになる）。
const TECH_BUCKET_LABELS: { key: keyof ProjectItem['tech']; label: string }[] = [
  { key: 'lang', label: '使用言語' },
  { key: 'fw', label: 'フレームワーク・ライブラリ' },
  { key: 'db', label: 'データベース' },
  { key: 'infra', label: 'クラウド・インフラ' },
  { key: 'tools', label: '開発ツール' },
  { key: 'collab', label: 'コラボレーションツール' },
];

// コメントの「要約＋展開」用に空行で段落を割る。既定は先頭2段落まで表示する。
const COMMENT_PREVIEW_PARAGRAPHS = 2;

/**
 * ラベル＋上罫線で階層を作るカード。本文はすべて --foreground に統一し、
 * 色の濃淡ではなくラベルで「これは何の情報か」を示す（見づらさの原因2への対処）。
 * 会社名・会社概要文（company.note）はセクション見出し（CompanySection）側へ移したため、
 * ここでは扱わない。
 */
export const ProjectCard = ({ item, no, activeTech }: ProjectCardProps) => {
  const [commentOpen, setCommentOpen] = useState(false);
  const normalized = normalizeProcess(item.process);
  const duration = sanitizeHtml(item.duration?.trim() || deriveDuration(item.period));
  const summary = item.summary?.trim() || item.duties;
  const area = resolveProjectArea(item.scope, item.tech);

  const commentParagraphs = item.comment
    ? collapseSoftBreaks(item.comment)
        .split(/\n{2,}/)
        .filter(Boolean)
    : [];
  const hasMoreComment = commentParagraphs.length > COMMENT_PREVIEW_PARAGRAPHS;
  const commentShownText = (
    commentOpen ? commentParagraphs : commentParagraphs.slice(0, COMMENT_PREVIEW_PARAGRAPHS)
  ).join('\n\n');

  const techGroups = TECH_BUCKET_LABELS.map(({ key, label }) => ({
    label,
    items: item.tech[key].filter(Boolean),
  })).filter((g) => g.items.length > 0);

  return (
    <article
      className="flex min-w-0 flex-col gap-4 rounded-[var(--radius-lg)] bg-card px-6 py-6 transition-colors duration-150 hover:border-primary"
      style={{ border: '1px solid var(--border)' }}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          {/* bg-primary は on-accent と組むとライトテーマで3.74と WCAG AA 未達（Issue #198）。 */}
          <span className="rounded-[var(--radius)] bg-primary-dark px-1.5 py-px font-mono text-[11px] text-on-accent">
            {String(no).padStart(2, '0')}
          </span>
          <span className="font-mono text-[11.5px] text-muted-foreground">
            {formatPeriodDisplay(item.period) || '(期間未入力)'}
          </span>
        </div>
        <h3 className="text-[17px] leading-snug text-foreground">{sanitizeHtml(item.title) || '(タイトル未入力)'}</h3>
        {/* 導出値には必ず「技術領域」を添える。タイトル直下という位置だけで読み手は
            「担当した領域」と受け取るが、技術スタックから言えるのは「その技術がどの領域か」まで。
            取り込んだ scope は本人の言葉なのでラベルを付けない（tech-area.ts 参照）。 */}
        {area.text && (
          <p className="text-[12.5px] text-muted-foreground">
            {area.derived && <span className="kicker mr-1.5">技術領域</span>}
            {sanitizeHtml(area.text)}
          </p>
        )}
        {/* 未入力を黙って落とすと「役割の記載が無い案件」と区別できない。— で欠損を明示する。 */}
        <dl className="flex flex-wrap gap-x-7 gap-y-2.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-[12px] text-muted-foreground">期間</dt>
            <dd className="text-[14px] text-foreground">
              {formatPeriodDisplay(item.period) || '—'}
              {duration && `（${duration}）`}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-[12px] text-muted-foreground">役割</dt>
            <dd className="text-[14px] text-foreground break-words">{item.role ? sanitizeHtml(item.role) : '—'}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-[12px] text-muted-foreground">チーム規模</dt>
            <dd className="text-[14px] text-foreground">{item.team ? formatTeamSize(item.team) : '—'}</dd>
          </div>
        </dl>
      </div>

      {summary && (
        <div
          className="flex flex-col gap-2"
          style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--gap-in-card, 16px)' }}
        >
          <span className="text-[13px] text-muted-foreground">担当業務</span>
          <InlineMarkdown
            content={collapseSoftBreaks(summary)}
            className="break-words text-[15px] leading-[1.9] text-foreground"
          />
        </div>
      )}

      {item.acquired && (
        <div
          className="flex flex-col gap-2"
          style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--gap-in-card, 16px)' }}
        >
          <span className="text-[13px] text-muted-foreground">習得スキル</span>
          <InlineMarkdown
            content={collapseSoftBreaks(item.acquired)}
            className="break-words text-[15px] leading-[1.9] text-foreground"
          />
        </div>
      )}

      {item.comment && (
        <div
          className="flex flex-col items-start gap-2.5"
          style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--gap-in-card, 16px)' }}
        >
          <span className="text-[13px] text-muted-foreground">コメント</span>
          <InlineMarkdown
            content={commentShownText}
            className="break-words text-[15px] leading-[1.9] text-foreground"
          />
          {hasMoreComment && (
            <button
              type="button"
              onClick={() => setCommentOpen((v) => !v)}
              aria-expanded={commentOpen}
              className="min-h-11 whitespace-nowrap rounded px-3.5 py-2 text-[13px] text-accent-text hover:bg-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              style={{ border: '1px solid var(--border-strong)' }}
            >
              {commentOpen ? '閉じる' : `続きを読む（残り ${commentParagraphs.length - COMMENT_PREVIEW_PARAGRAPHS}）`}
            </button>
          )}
        </div>
      )}

      {normalized.other.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="kicker self-center">その他の役割</span>
          {normalized.other.map((role) => (
            <span key={role} className="techtag">
              {role}
            </span>
          ))}
        </div>
      )}

      <div
        className="flex flex-col gap-2"
        style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--gap-in-card, 16px)' }}
      >
        <span className="text-[13px] text-muted-foreground">
          担当工程　<span className="font-mono">{normalized.done.filter(Boolean).length} / 7</span>
        </span>
        <ProcessStepper done={normalized.done} />
      </div>

      {techGroups.length > 0 && (
        <div
          className="flex flex-col gap-2.5"
          style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--gap-in-card, 16px)' }}
        >
          <span className="text-[13px] text-muted-foreground">技術スタック</span>
          <div className="flex flex-col gap-1.5">
            {techGroups.map((g) => (
              <div
                key={g.label}
                className="grid grid-cols-[88px_1fr] items-baseline gap-x-3.5 gap-y-1.5 sm:grid-cols-[110px_1fr]"
              >
                <span className="text-[12px] text-muted-foreground">{g.label}</span>
                <div className="flex min-w-0 flex-wrap gap-1.5">
                  {g.items.map((t) => (
                    <span key={t} className={`techtag ${activeTech.includes(t) ? 'hit' : ''}`}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
};
