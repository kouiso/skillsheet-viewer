'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CompanyInfo, ProjectBlockData, ProjectItem } from '@skillsheet/db/blocks';
import { Eye, EyeOff } from 'lucide-react';
import { useMemo, useState } from 'react';

// 案件エディタ 3 ペインの共通スタイル。CSS はモジュール単位で一度読み込めば全体へ効くため、
// 最初に使う側（このナビ）で読み込む。閲覧側のバンドルには入らない。
import './editor.css';
import { buildVisibleNoMap } from './visible-no';

/** D&D 対象の識別用データ（company ヘッダへ案件をドロップすると companyId を付け替える）。 */
type DragData = { type: 'company' | 'project' };

interface ProjectNavProps {
  data: ProjectBlockData;
  selectedId: string | null;
  onSelect: (projectId: string) => void;
  /** 会社ヘッダをクリックしたとき（案件未選択でも会社編集バーを出すため）。 */
  onSelectCompany: (companyId: string) => void;
  onAddProject: (companyId: string) => void;
  onAddCompany: () => void;
  onDeleteProject: (projectId: string) => void;
  /** 会社ごと削除（confirm はハンドラ側で行う）。 */
  onDeleteCompany: (companyId: string) => void;
  /** 集中モード（58px レール）へ畳む。 */
  onCollapse: () => void;
  onToggleHideProject: (projectId: string) => void;
  onToggleHideCompany: (companyId: string) => void;
  /** 案件を別の案件の位置へ並べ替え（移動先案件の companyId を引き継ぐ）。 */
  onReorderProject: (activeId: string, overId: string) => void;
  /** 案件を会社ヘッダへドロップ（その会社の末尾へ移動 + companyId 付け替え）。 */
  onDropProjectToCompany: (projectId: string, companyId: string) => void;
  onReorderCompany: (activeId: string, overId: string) => void;
}

/** 会社ヘッダ行（sortable — 会社の並び替え & 案件ドロップの受け皿）。 */
const CompanyHeaderRow = ({
  company,
  count,
  open,
  onToggleOpen,
  onToggleHide,
  onSelectCompany,
  onDelete,
}: {
  company: CompanyInfo;
  count: number;
  open: boolean;
  onToggleOpen: () => void;
  onToggleHide: () => void;
  onSelectCompany: () => void;
  onDelete: () => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: company.id,
    data: { type: 'company' } satisfies DragData,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const label = company.name || '(会社名未入力)';

  return (
    <div ref={setNodeRef} style={style} className={`co-head-row${isOver ? ' dragover' : ''}`}>
      {/* grip 自体を D&D ハンドルにする（行全体をハンドルにすると開閉クリックと競合する）。
          dnd-kit のキーボード操作を残すため button のままにしている。 */}
      <button
        type="button"
        className="co-grip touch-none"
        aria-label={`${label} を並べ替え`}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <button
        type="button"
        onClick={() => {
          onSelectCompany();
          onToggleOpen();
        }}
        className={`co-head${open ? ' open' : ''}`}
        aria-expanded={open}
      >
        <span aria-hidden className="caret">
          ▶
        </span>
        <span className="co-name">{label}</span>
        {company.kind && <span className="kindtag">{company.kind}</span>}
        <span className="co-count">{count}</span>
      </button>
      <button
        type="button"
        onClick={onToggleHide}
        aria-label={company.hidden ? '閲覧側で表示する' : '閲覧側で非表示にする'}
        aria-pressed={Boolean(company.hidden)}
        title={company.hidden ? '閲覧側で非表示中 — クリックで表示' : '閲覧側で非表示にする'}
        className={`row-eye${company.hidden ? ' on' : ''}`}
      >
        {company.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
      <button type="button" onClick={onDelete} aria-label={`${label} を削除`} title="会社を削除" className="co-del">
        ×
      </button>
    </div>
  );
};

/** 案件行（sortable — 会社内/会社間の並び替え）。 */
const ProjectRow = ({
  project,
  visibleNo,
  active,
  onSelect,
  onToggleHide,
  onDelete,
}: {
  project: ProjectItem;
  /** 閲覧側で見える通し番号（非表示は 0 = "––" 表示）。 */
  visibleNo: number;
  active: boolean;
  onSelect: () => void;
  onToggleHide: () => void;
  onDelete: () => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: project.id,
    data: { type: 'project' } satisfies DragData,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const missingRequired = !project.title.trim() || !project.period;
  const label = project.title || '（無題の案件）';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`proj-item${active ? ' active' : ''}${project.hidden ? ' hid' : ''}${isOver ? ' dragover' : ''}`}
    >
      <button
        type="button"
        className="grip touch-none"
        aria-label={`${label} を並べ替え`}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="pno">{visibleNo > 0 ? String(visibleNo).padStart(2, '0') : '––'}</span>
        <span className="ptitle">{label}</span>
        {missingRequired && (
          <span className="warn-dot" title="必須項目（タイトル・期間）に未入力があります">
            !
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onToggleHide}
        aria-label={project.hidden ? '閲覧側で表示する' : '閲覧側で非表示にする'}
        aria-pressed={Boolean(project.hidden)}
        title={project.hidden ? '閲覧側で非表示中 — クリックで表示' : '閲覧側で非表示にする'}
        className={`row-eye${project.hidden ? ' on' : ''}`}
      >
        {project.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
      <button type="button" onClick={onDelete} aria-label="案件を削除" title="案件を削除" className="row-del">
        ×
      </button>
    </div>
  );
};

/**
 * 左ペイン：会社別の案件ナビゲーション。
 *
 * - 会社グループの開閉（種別タグ + 案件数）
 * - 行ごとの目玉トグル（hidden 反転）・削除（confirm）
 * - dnd-kit による並び替え：会社同士 / 会社内の案件 / 会社ヘッダへの案件ドロップ（companyId 付け替え）
 */
export const ProjectNav = ({
  data,
  selectedId,
  onSelect,
  onSelectCompany,
  onAddProject,
  onAddCompany,
  onDeleteProject,
  onDeleteCompany,
  onCollapse,
  onToggleHideProject,
  onToggleHideCompany,
  onReorderProject,
  onDropProjectToCompany,
  onReorderCompany,
}: ProjectNavProps) => {
  // 開閉状態：初期は選択中案件の会社のみ開く（未選択なら全開）。以降はユーザー操作を保持。
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const current = data.items.find((p) => p.id === selectedId);
    const init: Record<string, boolean> = {};
    for (const c of data.companies) init[c.id] = current ? current.companyId === c.id : true;
    return init;
  });

  const byCompany = useMemo(() => {
    const map = new Map<string, ProjectItem[]>();
    for (const c of data.companies) map.set(c.id, []);
    for (const p of data.items) {
      const list = map.get(p.companyId);
      if (list) list.push(p);
      else map.set(p.companyId, [p]);
    }
    return map;
  }, [data]);

  // data.companies に存在しない companyId を持つ案件（閲覧側/PDFは「不明な会社」として表示する）。
  // ナビでも同じものを見せないと、閲覧面には出るのにエディタでは触れない案件が生まれる。
  const orphanProjects = useMemo(() => {
    const knownIds = new Set(data.companies.map((c) => c.id));
    return data.items.filter((p) => !knownIds.has(p.companyId));
  }, [data]);

  const visibleNoOf = useMemo(() => buildVisibleNoMap(data), [data]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeType = (active.data.current as DragData | undefined)?.type;
    const overType = (over.data.current as DragData | undefined)?.type;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeType === 'company' && overType === 'company') {
      onReorderCompany(activeId, overId);
      return;
    }
    if (activeType === 'project') {
      if (overType === 'project') {
        onReorderProject(activeId, overId);
      } else if (overType === 'company') {
        // 会社ヘッダへドロップ → その会社へ所属替え（末尾に追加）し、グループを開く
        onDropProjectToCompany(activeId, overId);
        setOpen((prev) => ({ ...prev, [overId]: true }));
      }
    }
  };

  const confirmDeleteProject = (project: ProjectItem) => {
    if (!window.confirm(`「${project.title || '無題の案件'}」を削除しますか？`)) return;
    onDeleteProject(project.id);
  };

  return (
    <aside className="col-list">
      <div className="list-head">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="kicker">skillsheet · editor</div>
            <div className="ttl">案件エディタ</div>
            <div className="sub">
              {data.companies.length}社 / {data.items.length}案件
            </div>
          </div>
          <button type="button" className="rail-btn shrink-0" onClick={onCollapse} title="集中モード（ナビを畳む）">
            ⇤
          </button>
        </div>
      </div>

      <div className="list-body scroll">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={data.companies.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {data.companies.map((company) => {
              const items = byCompany.get(company.id) ?? [];
              const isOpen = open[company.id] ?? true;
              return (
                <div key={company.id} className={`co-group${company.hidden ? ' hid' : ''}`}>
                  <CompanyHeaderRow
                    company={company}
                    count={items.length}
                    open={isOpen}
                    onToggleOpen={() => setOpen((prev) => ({ ...prev, [company.id]: !isOpen }))}
                    onToggleHide={() => onToggleHideCompany(company.id)}
                    onSelectCompany={() => onSelectCompany(company.id)}
                    onDelete={() => onDeleteCompany(company.id)}
                  />
                  {isOpen && (
                    <div className="proj-list">
                      <SortableContext items={items.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                        {items.map((project) => (
                          <ProjectRow
                            key={project.id}
                            project={project}
                            visibleNo={visibleNoOf.get(project.id) ?? 0}
                            active={project.id === selectedId}
                            onSelect={() => onSelect(project.id)}
                            onToggleHide={() => onToggleHideProject(project.id)}
                            onDelete={() => confirmDeleteProject(project)}
                          />
                        ))}
                      </SortableContext>
                      <button type="button" onClick={() => onAddProject(company.id)} className="add-proj">
                        ＋ この会社に案件を追加
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </SortableContext>
        </DndContext>
        {data.companies.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">「＋ 会社」から会社を追加してください</p>
        )}
        {orphanProjects.length > 0 && (
          <div className="co-group mt-2 border-t border-dashed border-border pt-2">
            <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
              不明な会社（{orphanProjects.length}）
            </div>
            <div className="proj-list">
              {orphanProjects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  visibleNo={visibleNoOf.get(project.id) ?? 0}
                  active={project.id === selectedId}
                  onSelect={() => onSelect(project.id)}
                  onToggleHide={() => onToggleHideProject(project.id)}
                  onDelete={() => confirmDeleteProject(project)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <button type="button" onClick={onAddCompany} className="btn sm">
          ＋ 会社
        </button>
      </div>
    </aside>
  );
};
