'use client';

import type { ProjectBlockData } from '@skillsheet/db/blocks';
import { useMemo } from 'react';

import { buildVisibleNoMap } from './visible-no';

interface RailNavProps {
  data: ProjectBlockData;
  selectedId: string | null;
  onSelect: (projectId: string) => void;
  /** 集中モードを解除して通常のナビへ戻す。 */
  onExpand: () => void;
}

/** 会社名から 2 文字の略称を作る（レール幅 36px に収まる長さ）。 */
const abbreviate = (name: string): string => (name.trim() ? name.trim().slice(0, 2) : '––');

/**
 * 集中モード（58px レール）の左ペイン。
 * 会社の略称と案件の通し番号だけを縦に並べ、名前は hover ツールチップ（CSS `[data-tip]`）で出す。
 */
export const RailNav = ({ data, selectedId, onSelect, onExpand }: RailNavProps) => {
  const visibleNoOf = useMemo(() => buildVisibleNoMap(data), [data]);

  return (
    <aside className="col-list">
      <nav className="rail-nav scroll">
        <button type="button" className="rail-btn" onClick={onExpand} data-tip="ナビを展開" aria-label="ナビを展開">
          ☰
        </button>
        {data.companies.map((company) => {
          const items = data.items.filter((p) => p.companyId === company.id);
          if (items.length === 0) return null;
          return (
            <div key={company.id} className="contents">
              <div
                className={`rail-co${company.hidden ? ' hid' : ''}`}
                data-tip={company.name || '(会社名未入力)'}
                aria-hidden
              >
                {abbreviate(company.name)}
              </div>
              {items.map((project) => {
                const no = visibleNoOf.get(project.id) ?? 0;
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => onSelect(project.id)}
                    className={`rail-pj${project.id === selectedId ? ' active' : ''}${project.hidden ? ' hid' : ''}`}
                    data-tip={project.title || '（無題の案件）'}
                    aria-label={project.title || '（無題の案件）'}
                    aria-current={project.id === selectedId ? 'true' : undefined}
                  >
                    {no > 0 ? String(no).padStart(2, '0') : '––'}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
};
