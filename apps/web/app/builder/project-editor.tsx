'use client';

import type { CompanyInfo, ProjectBlockData, ProjectItem } from '@skillsheet/db/blocks';
import { deriveCompanyPeriod } from '@skillsheet/db/process';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CompanyBar, ProjectForm } from './project-form';
import { ProjectNav } from './project-nav';
import { ProjectPreview } from './project-preview';

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const emptyProject = (companyId: string): ProjectItem => ({
  id: newId(),
  companyId,
  title: '',
  scope: '',
  period: '',
  role: '',
  team: '',
  tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] },
  process: [],
  duties: '',
  acquired: '',
  comment: '',
  summary: '',
  duration: '',
});

const emptyCompany = (): CompanyInfo => ({
  id: newId(),
  name: '',
  kind: '',
  period: '',
  note: '',
});

/** 会社にひもづく案件の period 集合（並び順の影響を除くためソート済み文字列にする）。 */
const companyPeriodsKey = (data: ProjectBlockData, companyId: string): string =>
  data.items
    .filter((p) => p.companyId === companyId)
    .map((p) => p.period)
    .sort()
    .join('\n');

/**
 * 会社の期間をひもづく案件の period 群から自動導出して上書きする。
 * - その会社の案件 period 集合が今回の変更で変わっていない場合、既存の非空 period は温存する
 *   （旧エディタで手書きされた会社期間を、無関係な編集のたびに自動導出値で潰さない —
 *   会社期間入力は読み取り専用のため、潰すと復元手段がない）。
 * - 既存 period が空の会社は常に自動導出で補完する。
 * - 1件もパースできない（derive が ''）場合は既存値を温存する（データを消さない）。
 */
const withDerivedCompanyPeriods = (prev: ProjectBlockData, next: ProjectBlockData): ProjectBlockData => ({
  ...next,
  companies: next.companies.map((company) => {
    if (company.period && companyPeriodsKey(prev, company.id) === companyPeriodsKey(next, company.id)) {
      return company;
    }
    const derived = deriveCompanyPeriod(next.items.filter((p) => p.companyId === company.id).map((p) => p.period));
    return derived && derived !== company.period ? { ...company, period: derived } : company;
  }),
});

/** builder-client のトップバー breadcrumb 用の選択情報。 */
export interface ProjectEditorSelection {
  companyName: string;
  /** 閲覧側の通し番号。0 = 非表示（欠番）。 */
  visibleNo: number;
}

interface ProjectEditorProps {
  data: ProjectBlockData;
  onChange: (data: ProjectBlockData) => void;
  /** 選択中の会社/案件が変わったとき breadcrumb 表示用に通知する（任意）。 */
  onSelectionChange?: (selection: ProjectEditorSelection | null) => void;
}

/**
 * 案件エディタ本体：3 ペイン構成（会社別ナビ / 編集フォーム / ライブプレビュー）。
 * 外部契約は {data, onChange} のまま（builder-client の差分を最小化）。
 * 会社の period は items 変更のたびに deriveCompanyPeriod で自動再計算する。
 */
export const ProjectEditor = ({ data, onChange, onSelectionChange }: ProjectEditorProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(data.items[0]?.id ?? null);
  // 案件未選択でも会社編集バー（名称変更・削除）を出せるよう、会社選択を案件選択と独立に持つ。
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(
    data.items[0]?.companyId ?? data.companies[0]?.id ?? null,
  );
  const [showPreview, setShowPreview] = useState(true);

  // selectedId===null は「会社のみ選択（案件は未選択）」を明示する状態として扱い、
  // フォールバックしない。selectedId が非null なのに該当案件が無い（削除等で stale）
  // 場合だけ、防御的に先頭案件へフォールバックする。
  const current = selectedId === null ? null : (data.items.find((p) => p.id === selectedId) ?? data.items[0] ?? null);
  const currentId = current?.id ?? null;
  // 案件が選択されていれば常にその会社を優先し、無ければ selectedCompanyId（会社のみ選択中）を使う。
  const currentCompany = current
    ? data.companies.find((c) => c.id === current.companyId)
    : (data.companies.find((c) => c.id === selectedCompanyId) ?? undefined);

  const selectProject = (projectId: string) => {
    setSelectedId(projectId);
    const project = data.items.find((p) => p.id === projectId);
    if (project) setSelectedCompanyId(project.companyId);
  };

  const selectCompany = (companyId: string) => {
    setSelectedCompanyId(companyId);
    // 会社ヘッダのクリックは「会社そのものを編集したい」操作として案件選択を解除する。
    // current を残したままだと currentCompany の解決が current 側を優先してしまい、
    // 別会社のヘッダをクリックしても会社編集バーが切り替わらない。
    setSelectedId(null);
  };

  // items 変更を伴う更新は必ず会社期間の再導出を通す（変更前 data と比較し、
  // 案件 period が実際に変わった会社だけ再導出する）
  const commit = useCallback(
    (next: ProjectBlockData) => onChange(withDerivedCompanyPeriods(data, next)),
    [onChange, data],
  );

  // 閲覧側で見える通し番号（hidden の案件・hidden の会社配下は欠番にせず詰める）
  const visibleNoOf = useMemo(() => {
    const hiddenCompany = new Set(data.companies.filter((c) => c.hidden).map((c) => c.id));
    const map = new Map<string, number>();
    let n = 0;
    for (const p of data.items) {
      if (!p.hidden && !hiddenCompany.has(p.companyId)) map.set(p.id, ++n);
    }
    return map;
  }, [data]);

  // プレビュー用：非表示でも「表示されたと仮定した番号」を出す（バッジで非表示を明示）
  const previewNo = useMemo(() => {
    if (!currentId) return 0;
    const hiddenCompany = new Set(data.companies.filter((c) => c.hidden).map((c) => c.id));
    let n = 0;
    for (const p of data.items) {
      const visible = !p.hidden && !hiddenCompany.has(p.companyId);
      if (p.id === currentId) return n + 1;
      if (visible) n++;
    }
    return 0;
  }, [data, currentId]);

  // breadcrumb（会社名 / 案件NN）を builder-client のトップバーへ通知
  const selectionCompanyName = currentCompany?.name ?? '';
  const selectionNo = currentId ? (visibleNoOf.get(currentId) ?? 0) : 0;
  useEffect(() => {
    onSelectionChange?.(currentId ? { companyName: selectionCompanyName, visibleNo: selectionNo } : null);
  }, [currentId, selectionCompanyName, selectionNo, onSelectionChange]);

  // ── 案件の更新 ──
  const patchProject = (patch: Partial<ProjectItem>) => {
    if (!currentId) return;
    commit({ ...data, items: data.items.map((p) => (p.id === currentId ? { ...p, ...patch } : p)) });
  };

  /**
   * 案件を別会社へ所属替えする（selectでの変更・D&Dドロップの両方が使う共通処理）。
   * companyId を書き換えるだけでなく、data.items 内の位置も
   * 「移動先会社の最後の案件の直後」（無ければ末尾）へ動かす。
   * companyId だけ書き換えて位置を放置すると、閲覧側は data.items の並びで
   * 描画するため、会社ナビの表示と矛盾した並び・連番になる。
   */
  const moveProjectToCompany = (projectId: string, companyId: string) => {
    const source = data.items.find((p) => p.id === projectId);
    if (!source || source.companyId === companyId) return;
    const rest = data.items.filter((p) => p.id !== projectId);
    let lastIndex = -1;
    rest.forEach((p, i) => {
      if (p.companyId === companyId) lastIndex = i;
    });
    const items = [...rest];
    const insertAt = lastIndex === -1 ? items.length : lastIndex + 1;
    items.splice(insertAt, 0, { ...source, companyId });
    commit({ ...data, items });
  };

  const moveCompany = (companyId: string) => {
    if (!currentId) return;
    moveProjectToCompany(currentId, companyId);
  };

  const patchCompany = (patch: Partial<CompanyInfo>) => {
    if (!currentCompany) return;
    commit({
      ...data,
      companies: data.companies.map((c) => (c.id === currentCompany.id ? { ...c, ...patch } : c)),
    });
  };

  // ── 追加・削除 ──
  const addProject = (companyId: string) => {
    const project = emptyProject(companyId);
    // 挿入位置＝「同じ会社の最後の案件の直後」。その会社にまだ案件が無い場合は
    // 配列の先頭(index 0)ではなく末尾に追加する。data.items は会社の並び順で
    // グルーピングされている保証が無い（reorderCompany 未実行の既存データ等）ため、
    // 会社の並び順から挿入位置を逆算する方式は既存データで誤動作する。
    // 「無ければ末尾」という最小差分の修正に留め、同会社に案件が既にある場合の
    // 挙動（今まで通り安全に動いている）は一切変えない。
    let lastIndex = -1;
    data.items.forEach((p, i) => {
      if (p.companyId === companyId) lastIndex = i;
    });
    const items = [...data.items];
    const insertAt = lastIndex === -1 ? items.length : lastIndex + 1;
    items.splice(insertAt, 0, project);
    commit({ ...data, items });
    setSelectedId(project.id);
    setSelectedCompanyId(companyId);
  };

  const addCompany = () => {
    const company = emptyCompany();
    commit({ ...data, companies: [...data.companies, company] });
    // 追加直後に会社編集バーを出す（＋会社→即リネームできる導線）。
    setSelectedId(null);
    setSelectedCompanyId(company.id);
  };

  /** ナビ側は行内で confirm 済みのため、ここでは削除のみ行う。 */
  const deleteProject = (id: string) => {
    commit({ ...data, items: data.items.filter((p) => p.id !== id) });
    if (selectedId === id) {
      const rest = data.items.filter((p) => p.id !== id);
      setSelectedId(rest[0]?.id ?? null);
    }
  };

  /** フォーム下部の削除ボタン用（confirm 付き）。 */
  const confirmDeleteCurrentProject = () => {
    if (!current) return;
    if (!window.confirm(`「${current.title || '無題の案件'}」を削除しますか？`)) return;
    deleteProject(current.id);
  };

  const deleteCompany = (companyId: string) => {
    const company = data.companies.find((c) => c.id === companyId);
    if (!company) return;
    const children = data.items.filter((p) => p.companyId === companyId);
    const message =
      children.length > 0
        ? `「${company.name || '(会社名未入力)'}」と、ひもづく案件 ${children.length} 件をすべて削除しますか？\nこの操作は取り消せません。`
        : `「${company.name || '(会社名未入力)'}」を削除しますか？`;
    if (!window.confirm(message)) return;
    const items = data.items.filter((p) => p.companyId !== companyId);
    const companies = data.companies.filter((c) => c.id !== companyId);
    commit({ ...data, companies, items });
    if (current && current.companyId === companyId) {
      setSelectedId(items[0]?.id ?? null);
    }
    if (selectedCompanyId === companyId) {
      setSelectedCompanyId(companies[0]?.id ?? null);
    }
  };

  // ── D&D 並び替え・所属替え・表示トグル ──
  const reorderProject = (activeId: string, overId: string) => {
    if (activeId === overId) return;
    const items = [...data.items];
    const oldIndex = items.findIndex((p) => p.id === activeId);
    // 挿入位置は「取り除く前」の配列で決める（arrayMove と同じ規約）。取り除いた後に
    // findIndex すると下方向のドラッグが 1 つ手前にずれ、隣への移動が no-op になる。
    const newIndex = items.findIndex((p) => p.id === overId);
    const over = items[newIndex];
    if (oldIndex === -1 || newIndex === -1 || !over) return;
    const [moved] = items.splice(oldIndex, 1);
    // 移動先案件の位置へ挿入し、その会社へ所属替え（会社をまたぐ D&D に対応）
    items.splice(newIndex, 0, { ...moved, companyId: over.companyId });
    commit({ ...data, items });
  };

  const dropProjectToCompany = (projectId: string, companyId: string) => moveProjectToCompany(projectId, companyId);

  const reorderCompany = (activeId: string, overId: string) => {
    if (activeId === overId) return;
    const companies = [...data.companies];
    const oldIndex = companies.findIndex((c) => c.id === activeId);
    // 挿入位置は「取り除く前」の配列で決める（reorderProject と同じ理由）
    const newIndex = companies.findIndex((c) => c.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;
    const [moved] = companies.splice(oldIndex, 1);
    companies.splice(newIndex, 0, moved);
    // 会社の並び替えに合わせて items も並べ替える（各会社内の相対順序は保つ = 安定ソート）。
    // これをしないと、閲覧側の連番・並びが会社ナビの並びと食い違う。
    const companyOrder = new Map(companies.map((c, i) => [c.id, i]));
    const items = [...data.items].sort(
      (a, b) =>
        (companyOrder.get(a.companyId) ?? Number.MAX_SAFE_INTEGER) -
        (companyOrder.get(b.companyId) ?? Number.MAX_SAFE_INTEGER),
    );
    commit({ ...data, companies, items });
  };

  const toggleHideProject = (id: string) =>
    commit({ ...data, items: data.items.map((p) => (p.id === id ? { ...p, hidden: !p.hidden } : p)) });

  const toggleHideCompany = (id: string) =>
    commit({ ...data, companies: data.companies.map((c) => (c.id === id ? { ...c, hidden: !c.hidden } : c)) });

  return (
    <div
      className={`grid grid-cols-1 gap-4 ${
        showPreview ? 'lg:grid-cols-[260px_1fr_420px]' : 'lg:grid-cols-[260px_1fr]'
      }`}
    >
      {/* 左：会社別ナビ */}
      <ProjectNav
        data={data}
        selectedId={currentId}
        onSelect={selectProject}
        onSelectCompany={selectCompany}
        onAddProject={addProject}
        onAddCompany={addCompany}
        onDeleteProject={deleteProject}
        onToggleHideProject={toggleHideProject}
        onToggleHideCompany={toggleHideCompany}
        onReorderProject={reorderProject}
        onDropProjectToCompany={dropProjectToCompany}
        onReorderCompany={reorderCompany}
      />

      {/* 中央：編集フォーム */}
      <div className="min-w-0 space-y-3">
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
          >
            {showPreview ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
            {showPreview ? 'プレビューを隠す' : 'プレビュー表示'}
          </button>
        </div>
        {current ? (
          <ProjectForm
            project={current}
            company={currentCompany}
            data={data}
            onPatch={patchProject}
            onMoveCompany={moveCompany}
            onPatchCompany={patchCompany}
            onDeleteCompany={() => currentCompany && deleteCompany(currentCompany.id)}
            onDelete={confirmDeleteCurrentProject}
          />
        ) : currentCompany ? (
          <>
            {/* 案件が0件の会社でも名称変更・削除ができるよう、会社編集バーは単独でも表示する。 */}
            <CompanyBar
              company={currentCompany}
              onPatchCompany={patchCompany}
              onDeleteCompany={() => deleteCompany(currentCompany.id)}
            />
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm font-medium text-foreground">案件が選択されていません</p>
              <p className="mt-1 text-xs text-muted-foreground">
                左の一覧から案件を選ぶか、この会社に新しい案件を追加してください。
              </p>
              <button
                type="button"
                onClick={() => addProject(currentCompany.id)}
                className="mt-3 rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground"
              >
                ＋ 案件を追加
              </button>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-8 text-center">
            <p className="text-sm font-medium text-foreground">案件が選択されていません</p>
            <p className="mt-1 text-xs text-muted-foreground">
              左の一覧から案件を選ぶか、会社に新しい案件を追加してください。
            </p>
            {data.companies[0] && (
              <button
                type="button"
                onClick={() => addProject(data.companies[0].id)}
                className="mt-3 rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground"
              >
                ＋ 案件を追加
              </button>
            )}
          </div>
        )}
      </div>

      {/* 右：ライブプレビュー（トグル可） */}
      {showPreview && current && <ProjectPreview project={current} company={currentCompany} no={previewNo} />}
      {showPreview && !current && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
          プレビューする案件がありません。
        </div>
      )}
    </div>
  );
};
