'use client';

import type { CompanyInfo, ProjectBlockData, ProjectItem, ProjectTech } from '@skillsheet/db/blocks';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

const PROCESS_OPTIONS = [
  '要件定義',
  '基本設計',
  '詳細設計',
  '実装',
  'テスト',
  '運用・保守',
  'インフラ構築',
  'PM',
  'スクラム',
  'コードレビュー',
];

const TECH_KEYS: (keyof ProjectTech)[] = ['lang', 'fw', 'db', 'infra', 'tools', 'collab'];
const TECH_LABELS: Record<keyof ProjectTech, string> = {
  lang: '言語',
  fw: 'FW/ライブラリ',
  db: 'DB',
  infra: 'インフラ',
  tools: 'ツール',
  collab: 'コラボ',
};

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

// タグをカンマ区切りテキストと配列で相互変換するヘルパー
const tagsToText = (tags: string[]) => tags.join(', ');
const textToTags = (text: string): string[] =>
  text
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

interface CompanyFormProps {
  company: CompanyInfo;
  onChange: (patch: Partial<CompanyInfo>) => void;
  onDelete: () => void;
}

const CompanyForm = ({ company, onChange, onDelete }: CompanyFormProps) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">会社情報</span>
      <button
        type="button"
        onClick={onDelete}
        className="rounded p-1 text-muted-foreground hover:text-destructive"
        aria-label="会社を削除"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
    <input
      value={company.name}
      onChange={(e) => onChange({ name: e.target.value })}
      placeholder="会社名 *"
      className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
    />
    <div className="grid grid-cols-2 gap-2">
      <input
        value={company.kind ?? ''}
        onChange={(e) => onChange({ kind: e.target.value })}
        placeholder="形態（正社員/SES等）"
        className="rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <input
        value={company.period ?? ''}
        onChange={(e) => onChange({ period: e.target.value })}
        placeholder="在籍期間（例: 2020.04〜2023.03）"
        className="rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
    <input
      value={company.note ?? ''}
      onChange={(e) => onChange({ note: e.target.value })}
      placeholder="備考"
      className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
    />
  </div>
);

interface ProjectItemFormProps {
  project: ProjectItem;
  onChange: (patch: Partial<ProjectItem>) => void;
  onDelete: () => void;
}

const ProjectItemForm = ({ project, onChange, onDelete }: ProjectItemFormProps) => {
  const updateTech = (key: keyof ProjectTech, text: string) => {
    onChange({ tech: { ...project.tech, [key]: textToTags(text) } });
  };
  const toggleProcess = (p: string) => {
    const next = project.process.includes(p) ? project.process.filter((x) => x !== p) : [...project.process, p];
    onChange({ process: next });
  };

  return (
    <div className="mt-2 space-y-3 border-t border-border pt-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">案件詳細</span>
        <button
          type="button"
          onClick={onDelete}
          className="rounded p-1 text-muted-foreground hover:text-destructive"
          aria-label="案件を削除"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* 基本情報 */}
      <div className="space-y-2">
        <input
          value={project.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="案件名"
          className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={project.period ?? ''}
            onChange={(e) => onChange({ period: e.target.value })}
            placeholder="期間（例: 2022.01〜2023.06）"
            className="rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            value={project.scope ?? ''}
            onChange={(e) => onChange({ scope: e.target.value })}
            placeholder="規模（例: 10名）"
            className="rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <input
          value={project.duration ?? ''}
          onChange={(e) => onChange({ duration: e.target.value })}
          placeholder="期間の長さ（例: 3ヶ月）。空欄なら期間から自動算出"
          className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            value={project.role ?? ''}
            onChange={(e) => onChange({ role: e.target.value })}
            placeholder="役割（例: バックエンドエンジニア）"
            className="rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            value={project.team ?? ''}
            onChange={(e) => onChange({ team: e.target.value })}
            placeholder="チーム構成（例: PG3, QA2）"
            className="rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      {/* 担当工程 */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">担当工程</p>
        <div className="flex flex-wrap gap-1">
          {PROCESS_OPTIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => toggleProcess(p)}
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                project.process.includes(p)
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-background text-foreground hover:border-primary'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <input
          value={project.process.filter((p) => !PROCESS_OPTIONS.includes(p)).join(', ')}
          onChange={(e) => {
            const custom = textToTags(e.target.value);
            const predefined = project.process.filter((p) => PROCESS_OPTIONS.includes(p));
            onChange({ process: [...predefined, ...custom] });
          }}
          placeholder="その他（カンマ区切りで追加）"
          className="mt-1 w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* 技術スタック */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">技術スタック（カンマ区切り）</p>
        <div className="space-y-1">
          {TECH_KEYS.map((key) => (
            <div key={key} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">{TECH_LABELS[key]}</span>
              <input
                value={tagsToText(project.tech[key])}
                onChange={(e) => updateTech(key, e.target.value)}
                placeholder={`例: ${key === 'lang' ? 'TypeScript, Python' : key === 'fw' ? 'React, Next.js' : '...'}`}
                className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          ))}
        </div>
      </div>

      {/* 業務内容・習得スキル・コメント */}
      <div className="space-y-2">
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            要約（工程の俯瞰カードに表示。空欄なら業務内容を使用）
          </p>
          <textarea
            value={project.summary ?? ''}
            onChange={(e) => onChange({ summary: e.target.value })}
            placeholder="案件の要約を1〜3文で記載"
            rows={2}
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">業務内容</p>
          <textarea
            value={project.duties ?? ''}
            onChange={(e) => onChange({ duties: e.target.value })}
            placeholder="担当した業務内容を記載"
            rows={3}
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">習得スキル・実績</p>
          <textarea
            value={project.acquired ?? ''}
            onChange={(e) => onChange({ acquired: e.target.value })}
            placeholder="この案件で習得したスキルや実績"
            rows={2}
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">コメント</p>
          <input
            value={project.comment ?? ''}
            onChange={(e) => onChange({ comment: e.target.value })}
            placeholder="補足コメント"
            className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>
    </div>
  );
};

interface ProjectEditorProps {
  data: ProjectBlockData;
  onChange: (data: ProjectBlockData) => void;
}

export const ProjectEditor = ({ data, onChange }: ProjectEditorProps) => {
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(data.companies[0]?.id ?? null);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);

  const addCompany = () => {
    const company = emptyCompany();
    onChange({ ...data, companies: [...data.companies, company] });
    setSelectedCompanyId(company.id);
    setExpandedProjectId(null);
  };

  const updateCompany = (id: string, patch: Partial<CompanyInfo>) => {
    onChange({ ...data, companies: data.companies.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  };

  const deleteCompany = (id: string) => {
    const remaining = data.companies.filter((c) => c.id !== id);
    onChange({
      ...data,
      companies: remaining,
      items: data.items.filter((p) => p.companyId !== id),
    });
    setSelectedCompanyId(remaining[0]?.id ?? null);
    setExpandedProjectId(null);
  };

  const addProject = (companyId: string) => {
    const project = emptyProject(companyId);
    onChange({ ...data, items: [...data.items, project] });
    setExpandedProjectId(project.id);
  };

  const updateProject = (id: string, patch: Partial<ProjectItem>) => {
    onChange({ ...data, items: data.items.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  };

  const deleteProject = (id: string) => {
    onChange({ ...data, items: data.items.filter((p) => p.id !== id) });
    if (expandedProjectId === id) setExpandedProjectId(null);
  };

  const selectedCompany = data.companies.find((c) => c.id === selectedCompanyId);
  const companyProjects = selectedCompanyId ? data.items.filter((p) => p.companyId === selectedCompanyId) : [];

  return (
    <div className="flex gap-4 min-h-0">
      {/* 会社一覧（左ペイン） */}
      <div className="w-44 shrink-0 space-y-1">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">会社</span>
          <button
            type="button"
            onClick={addCompany}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="会社を追加"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        {data.companies.map((company) => (
          <button
            key={company.id}
            type="button"
            onClick={() => {
              setSelectedCompanyId(company.id);
              setExpandedProjectId(null);
            }}
            className={`w-full truncate rounded px-2 py-1.5 text-left text-sm transition-colors ${
              company.id === selectedCompanyId ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'
            }`}
          >
            {company.name || '(会社名未入力)'}
          </button>
        ))}
        {data.companies.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">+ で会社を追加</p>
        )}
      </div>

      {/* メイン編集エリア（右ペイン） */}
      <div className="min-w-0 flex-1 space-y-4">
        {selectedCompany ? (
          <>
            {/* 会社フォーム */}
            <div className="rounded border border-border p-3">
              <CompanyForm
                company={selectedCompany}
                onChange={(patch) => updateCompany(selectedCompany.id, patch)}
                onDelete={() => deleteCompany(selectedCompany.id)}
              />
            </div>

            {/* 案件リスト */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  案件一覧（{companyProjects.length}件）
                </span>
                <button
                  type="button"
                  onClick={() => addProject(selectedCompany.id)}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Plus className="size-3" />
                  案件追加
                </button>
              </div>

              <div className="space-y-2">
                {companyProjects.map((proj) => (
                  <div key={proj.id} className="rounded border border-border">
                    <button
                      type="button"
                      onClick={() => setExpandedProjectId(expandedProjectId === proj.id ? null : proj.id)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      {expandedProjectId === proj.id ? (
                        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="flex-1 truncate font-medium">{proj.title || '(タイトル未入力)'}</span>
                      {proj.period && <span className="shrink-0 text-xs text-muted-foreground">{proj.period}</span>}
                    </button>

                    {expandedProjectId === proj.id && (
                      <div className="px-3 pb-3">
                        <ProjectItemForm
                          project={proj}
                          onChange={(patch) => updateProject(proj.id, patch)}
                          onDelete={() => deleteProject(proj.id)}
                        />
                      </div>
                    )}
                  </div>
                ))}

                {companyProjects.length === 0 && (
                  <p className="rounded border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                    「案件追加」で案件を追加してください
                  </p>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {data.companies.length === 0 ? '左の「+」から会社を追加してください' : '左から会社を選択してください'}
          </p>
        )}
      </div>
    </div>
  );
};
