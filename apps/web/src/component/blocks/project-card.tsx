'use client';

import type { CompanyInfo, ProjectItem } from '@skillsheet/db/blocks';
import { deriveDuration, formatPeriodDisplay, normalizeProcess } from '@skillsheet/db/process';
import { resolveProjectArea } from '@skillsheet/db/tech-area';
import { formatTeamSize } from '@/util/format-team-size';
import { sanitizeHtml } from '@/util/sanitize-html';
import { InlineMarkdown } from '../inline-markdown';
import { ProcessStepper } from './process-stepper';

interface ProjectCardProps {
  item: ProjectItem;
  /** フィルタ前の全件配列基準の通し番号。絞り込んでも変わらない。 */
  no: number;
  company: CompanyInfo | undefined;
  /** ハイライト対象の技術（TechFilterで選択中のチップ）。 */
  activeTech: string[];
  /** flattenTech 済みの技術一覧。 */
  tech: string[];
}

export const ProjectCard = ({ item, no, company, activeTech, tech }: ProjectCardProps) => {
  const normalized = normalizeProcess(item.process);
  const duration = sanitizeHtml(item.duration?.trim() || deriveDuration(item.period));
  const summary = item.summary?.trim() || item.duties;
  const area = resolveProjectArea(item.scope, item.tech);

  return (
    <article className="flex min-w-0 flex-col gap-3.5 rounded-[var(--radius-lg)] border border-border bg-card px-[22px] py-5 transition-colors duration-150 hover:border-primary">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            {/* bg-primary は on-accent と組むとライトテーマで3.74と WCAG AA 未達（Issue #198）。 */}
            <span className="rounded-[var(--radius)] bg-primary-dark px-1.5 py-px font-mono text-[11px] text-on-accent">
              {String(no).padStart(2, '0')}
            </span>
            <span className="font-mono text-[11.5px] text-faint">
              {formatPeriodDisplay(item.period) || '(期間未入力)'}
            </span>
          </div>
          <h3 className="text-[17px] leading-snug text-foreground">{sanitizeHtml(item.title) || '(タイトル未入力)'}</h3>
          {/* 導出値には必ず「技術領域」を添える。タイトル直下という位置だけで読み手は
              「担当した領域」と受け取るが、技術スタックから言えるのは「その技術がどの領域か」まで。
              取り込んだ scope は本人の言葉なのでラベルを付けない（tech-area.ts 参照）。 */}
          {area.text && (
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              {area.derived && <span className="kicker mr-1.5">技術領域</span>}
              {sanitizeHtml(area.text)}
            </p>
          )}
          {/* 会社概要文（CompanyInfo.note）。従来どこにも描画先が無く、ビューア・PDF・バックアップの
              全経路で欠落していた（#139）。projectBlockToMarkdown 側も同じ位置づけで出力する。
              空白のみの値は projectBlockToMarkdown と同じく trim() 後に判定する。 */}
          {company?.note?.trim() && (
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground/80">
              {sanitizeHtml(company.note.trim())}
            </p>
          )}
        </div>
        {/* shrink-0 だと flex item の既定 min-width:auto（コンテンツの折返し前の幅が下限）が効き、
            320px では役割・会社名の長文が折り返さずカード幅を押し広げていた（#143）。
            min-w-0 に変えて行として折り返せるようにする。 */}
        <div className="min-w-0 text-right">
          {item.role && <div className="text-[12.5px] text-foreground">{sanitizeHtml(item.role)}</div>}
          <div className="mt-0.5 font-mono text-[11.5px] text-faint">
            {[sanitizeHtml(company?.name), item.team && formatTeamSize(item.team), duration]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      </div>

      {summary && (
        <InlineMarkdown content={summary} className="break-words text-[13.5px] leading-[1.85] text-muted-foreground" />
      )}

      {tech.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tech.map((t) => (
            // 押せないラベルなので .chip ではなく .techtag。検索一致時だけ強調する。
            <span key={t} className={`techtag ${activeTech.includes(t) ? 'hit' : ''}`}>
              {t}
            </span>
          ))}
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

      <div className="mt-0.5 border-t border-border pt-3.5">
        <ProcessStepper done={normalized.done} />
      </div>

      {item.acquired && (
        <div className="text-sm">
          <p className="mb-1 font-mono text-[10px] tracking-[0.1em] text-accent-text">≪習得スキル・実績≫</p>
          <InlineMarkdown content={item.acquired} className="break-words leading-relaxed text-foreground/80" />
        </div>
      )}

      {/* #152 S-2: 無条件 italic だと100〜918字の和文長文が合成斜体になり読みにくかった。
          引用の意味合いは左罫線だけで十分表現できているので italic は外す。 */}
      {item.comment && (
        <InlineMarkdown
          content={item.comment}
          className="whitespace-pre-line break-words border-l-2 border-primary pl-3 text-sm text-muted-foreground"
        />
      )}
    </article>
  );
};
