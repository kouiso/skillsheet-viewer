'use client';

import type { CompanyInfo, ProjectItem } from '@skillsheet/db/blocks';
import { deriveDuration, formatPeriodDisplay, normalizeProcess } from '@skillsheet/db/process';
import { ProcessStepper } from './ProcessStepper';

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
  const duration = item.duration?.trim() || deriveDuration(item.period);
  const summary = item.summary?.trim() || item.duties;

  return (
    <article className="flex min-w-0 flex-col gap-3.5 rounded-[var(--radius-lg)] border border-border bg-card px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-[var(--radius)] bg-primary px-1.5 py-px font-mono text-[11px] text-on-accent">
              {String(no).padStart(2, '0')}
            </span>
            <span className="font-mono text-[11.5px] text-faint">
              {formatPeriodDisplay(item.period) || '(期間未入力)'}
            </span>
          </div>
          <h3 className="text-[17px] leading-snug text-foreground">{item.title || '(タイトル未入力)'}</h3>
          {item.scope && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{item.scope}</p>}
        </div>
        <div className="shrink-0 text-right">
          {item.role && <div className="text-[12.5px] text-foreground">{item.role}</div>}
          <div className="mt-0.5 font-mono text-[11.5px] text-faint">
            {[company?.name, item.team && `${item.team}名`, duration].filter(Boolean).join(' · ')}
          </div>
        </div>
      </div>

      {summary && <p className="break-words text-[13.5px] leading-[1.85] text-muted-foreground">{summary}</p>}

      {tech.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tech.map((t) => (
            <span key={t} className={`chip ${activeTech.includes(t) ? 'on' : ''}`}>
              {t}
            </span>
          ))}
        </div>
      )}

      {normalized.other.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="kicker self-center">その他の役割</span>
          {normalized.other.map((role) => (
            <span key={role} className="chip">
              {role}
            </span>
          ))}
        </div>
      )}

      <div className="mt-0.5 border-t border-border pt-3.5">
        <ProcessStepper done={normalized.done} uncertain={normalized.uncertain} />
      </div>

      {item.acquired && (
        <div className="text-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">習得スキル・実績</p>
          <p className="whitespace-pre-wrap break-words leading-relaxed text-foreground/80">{item.acquired}</p>
        </div>
      )}

      {item.comment && (
        <p className="break-words border-l-2 border-primary pl-3 text-sm italic text-muted-foreground">{item.comment}</p>
      )}
    </article>
  );
};
