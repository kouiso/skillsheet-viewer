'use client';

import type { ProjectBlockData } from '@skillsheet/db/blocks';

interface ProjectCardProps {
  data: ProjectBlockData;
}

const TECH_LABELS: Record<string, string> = {
  lang: '言語',
  fw: 'FW/ライブラリ',
  db: 'DB',
  infra: 'インフラ',
  tools: 'ツール',
  collab: 'コラボ',
};

export const ProjectCard = ({ data }: ProjectCardProps) => {
  const companyMap = new Map(data.companies.map((c) => [c.id, c]));

  if (data.items.length === 0 && data.companies.length === 0) return null;

  // 会社別にグループ化
  const byCompany = new Map<string, typeof data.items>();
  for (const item of data.items) {
    const list = byCompany.get(item.companyId) ?? [];
    list.push(item);
    byCompany.set(item.companyId, list);
  }

  // companyIdが不明（孤児）な案件はフォールバックグループへ
  const orphans = data.items.filter((item) => !companyMap.has(item.companyId));

  return (
    <div className="mb-8 space-y-8">
      {data.companies.map((company) => {
        const items = byCompany.get(company.id) ?? [];
        return (
          <div key={company.id} className="border border-border">
            {/* 会社ヘッダ */}
            <div className="border-b border-border bg-muted px-4 py-2">
              <h3 className="font-semibold text-foreground">{company.name}</h3>
              <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {company.kind && <span>{company.kind}</span>}
                {company.period && <span>{company.period}</span>}
                {company.note && <span>{company.note}</span>}
              </div>
            </div>

            {/* 案件リスト */}
            <div className="divide-y divide-border">
              {items.map((item) => (
                <ProjectItem key={item.id} item={item} />
              ))}
              {items.length === 0 && (
                <p className="px-4 py-3 text-sm text-muted-foreground">案件なし</p>
              )}
            </div>
          </div>
        );
      })}

      {/* 孤児案件フォールバック */}
      {orphans.length > 0 && (
        <div className="border border-border">
          <div className="border-b border-border bg-muted px-4 py-2">
            <h3 className="font-semibold text-muted-foreground">(不明な会社)</h3>
          </div>
          <div className="divide-y divide-border">
            {orphans.map((item) => (
              <ProjectItem key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ProjectItem = ({ item }: { item: ProjectBlockData['items'][number] }) => {
  const techEntries = (Object.entries(item.tech) as [keyof typeof item.tech, string[]][]).filter(
    ([, v]) => v.length > 0,
  );

  return (
    <div className="px-4 py-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <h4 className="font-semibold text-foreground">{item.title || '(タイトル未入力)'}</h4>
        {item.period && (
          <span className="shrink-0 text-xs text-muted-foreground">{item.period}</span>
        )}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
        {item.role && (
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">役割</span>
            <p className="text-foreground">{item.role}</p>
          </div>
        )}
        {item.scope && (
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">規模</span>
            <p className="text-foreground">{item.scope}</p>
          </div>
        )}
        {item.team && (
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">チーム</span>
            <p className="text-foreground">{item.team}</p>
          </div>
        )}
      </div>

      {item.process.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">担当工程</p>
          <div className="flex flex-wrap gap-1">
            {item.process.map((p, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 静的リスト
              <span key={i} className="rounded bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {techEntries.length > 0 && (
        <div className="mb-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">技術スタック</p>
          <div className="space-y-1">
            {techEntries.map(([key, values]) => (
              <div key={key} className="flex flex-wrap items-baseline gap-1 text-xs">
                <span className="shrink-0 text-muted-foreground">{TECH_LABELS[key] ?? key}:</span>
                {values.map((v, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 静的リスト
                  <span key={i} className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-foreground">
                    {v}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {item.duties && (
        <div className="mb-2 text-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">業務内容</p>
          <p className="whitespace-pre-wrap leading-relaxed text-foreground/80">{item.duties}</p>
        </div>
      )}

      {item.acquired && (
        <div className="text-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">習得スキル・実績</p>
          <p className="whitespace-pre-wrap leading-relaxed text-foreground/80">{item.acquired}</p>
        </div>
      )}

      {item.comment && (
        <p className="mt-2 border-l-2 border-primary pl-3 text-sm italic text-muted-foreground">{item.comment}</p>
      )}
    </div>
  );
};
