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
import { ChevronRight, Eye, EyeOff, GripVertical, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';

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
}: {
  company: CompanyInfo;
  count: number;
  open: boolean;
  onToggleOpen: () => void;
  onToggleHide: () => void;
  onSelectCompany: () => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id: company.id,
    data: { type: 'company' } satisfies DragData,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-1 rounded-[var(--radius)] px-1 hover:bg-muted ${
        isOver ? 'ring-1 ring-primary/40' : ''
      } ${company.hidden ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-faint active:cursor-grabbing"
        aria-label={`${company.name || '(会社名未入力)'} を並べ替え`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => {
          onSelectCompany();
          onToggleOpen();
        }}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-2 text-left"
        aria-expanded={open}
      >
        <ChevronRight className={`size-3 shrink-0 text-faint transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-foreground">
          {company.name || '(会社名未入力)'}
        </span>
        {company.kind && (
          <span className="shrink-0 whitespace-nowrap font-mono text-[9.5px] text-primary">{company.kind}</span>
        )}
        <span className="shrink-0 rounded-full bg-muted px-1.5 font-mono text-[10.5px] text-faint">{count}</span>
      </button>
      <button
        type="button"
        onClick={onToggleHide}
        aria-label={company.hidden ? '閲覧側で表示する' : '閲覧側で非表示にする'}
        title={company.hidden ? '閲覧側で非表示中 — クリックで表示' : '閲覧側で非表示にする'}
        className={`rounded p-1 ${company.hidden ? 'text-primary' : 'text-faint hover:text-foreground'}`}
      >
        {company.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
    data: { type: 'project' } satisfies DragData,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const missingRequired = !project.title.trim() || !project.period;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex w-full items-center gap-1.5 rounded-[var(--radius)] border px-1.5 py-1.5 text-[12.5px] ${
        active
          ? 'border-primary/50 bg-muted text-foreground'
          : 'border-transparent text-muted-foreground hover:bg-muted'
      } ${project.hidden ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-faint active:cursor-grabbing"
        aria-label={`${project.title || '(無題の案件)'} を並べ替え`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
        <span className="shrink-0 font-mono text-[10.5px] text-faint">
          {visibleNo > 0 ? String(visibleNo).padStart(2, '0') : '––'}
        </span>
        <span className="min-w-0 flex-1 truncate">{project.title || '（無題の案件）'}</span>
        {missingRequired && (
          <span
            className="shrink-0 rounded-full bg-destructive/15 px-1.5 font-mono text-[10px] text-destructive"
            title="必須項目（タイトル・期間）に未入力があります"
          >
            !
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onToggleHide}
        aria-label={project.hidden ? '閲覧側で表示する' : '閲覧側で非表示にする'}
        title={project.hidden ? '閲覧側で非表示中 — クリックで表示' : '閲覧側で非表示にする'}
        className={`rounded p-1 ${project.hidden ? 'text-primary' : 'text-faint hover:text-foreground'}`}
      >
        {project.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="案件を削除"
        title="案件を削除"
        className="rounded p-1 text-faint hover:text-destructive"
      >
        <X className="size-3.5" />
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

  // 閲覧側で見える案件だけの通し番号（非表示は欠番にせず詰める）。
  const visibleNoOf = useMemo(() => {
    const hiddenCompany = new Set(data.companies.filter((c) => c.hidden).map((c) => c.id));
    const map = new Map<string, number>();
    let n = 0;
    for (const p of data.items) {
      if (!p.hidden && !hiddenCompany.has(p.companyId)) map.set(p.id, ++n);
    }
    return map;
  }, [data]);

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
    <div className="flex min-w-0 flex-col rounded-lg border border-border bg-card">
      <div className="border-b border-border px-3 py-3">
        <div className="kicker">skillsheet · editor</div>
        <div className="mt-1 text-sm font-bold text-foreground">案件エディタ</div>
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">
          {data.companies.length}社 / {data.items.length}案件
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={data.companies.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {data.companies.map((company) => {
              const items = byCompany.get(company.id) ?? [];
              const isOpen = open[company.id] ?? true;
              return (
                <div key={company.id} className="mb-1.5">
                  <CompanyHeaderRow
                    company={company}
                    count={items.length}
                    open={isOpen}
                    onToggleOpen={() => setOpen((prev) => ({ ...prev, [company.id]: !isOpen }))}
                    onToggleHide={() => onToggleHideCompany(company.id)}
                    onSelectCompany={() => onSelectCompany(company.id)}
                  />
                  {isOpen && (
                    <div className="ml-3 flex flex-col gap-0.5 border-l border-border pl-2 pt-1">
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
                      <button
                        type="button"
                        onClick={() => onAddProject(company.id)}
                        className="mt-0.5 flex items-center gap-1 rounded px-1.5 py-1 text-left text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="size-3" />
                        この会社に案件を追加
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
          <div className="mb-1.5 mt-2 border-t border-dashed border-border pt-2">
            <div className="flex items-center gap-1 px-1 py-1 text-xs font-semibold text-muted-foreground">
              不明な会社（{orphanProjects.length}）
            </div>
            <div className="ml-3 flex flex-col gap-0.5 border-l border-border pl-2 pt-1">
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

      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={onAddCompany}
          className="flex items-center gap-1 rounded border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
        >
          <Plus className="size-3.5" />
          会社
        </button>
      </div>
    </div>
  );
};
