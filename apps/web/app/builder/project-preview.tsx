'use client';

import type { CompanyInfo, ProjectItem } from '@skillsheet/db/blocks';
import { flattenTech } from '@skillsheet/db/process';

import { ProjectCard } from '@/component/blocks/ProjectCard';

interface ProjectPreviewProps {
  project: ProjectItem;
  company: CompanyInfo | undefined;
  /**
   * 閲覧側での通し番号。非表示（自分または会社が hidden）の場合も
   * 「表示されたと仮定したときの番号」を渡す — カードの見た目を維持しつつ
   * バッジで非表示であることを明示する。
   */
  no: number;
}

/**
 * 右ペイン：ライブプレビュー。
 * ビューア本体と同じ ProjectCard を再利用し、閲覧時の実際の見え方を再現する。
 * hidden（案件自身 or 所属会社）の場合は「閲覧側では非表示」バッジを添える。
 */
export const ProjectPreview = ({ project, company, no }: ProjectPreviewProps) => {
  const hidden = Boolean(project.hidden || company?.hidden);

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex items-center gap-2">
        <span className="kicker">Live Preview · 閲覧時の見え方</span>
        {hidden && (
          <span className="rounded-full bg-destructive/15 px-2 py-0.5 font-mono text-[10px] text-destructive">
            閲覧側では非表示
          </span>
        )}
      </div>
      <div className={hidden ? 'opacity-60' : undefined}>
        <ProjectCard item={project} no={no} company={company} activeTech={[]} tech={flattenTech(project.tech)} />
      </div>
    </div>
  );
};
