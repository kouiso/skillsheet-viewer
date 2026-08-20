'use client';

import type { ExperienceBlockData } from '@skillsheet/db/blocks';
import { DateTokenPicker } from '@/components/date-token-picker';

export const ExperienceBlockEditor = ({
  data,
  onChange,
}: {
  data: ExperienceBlockData;
  onChange: (data: ExperienceBlockData) => void;
}) => {
  const set = (field: keyof ExperienceBlockData, value: string) => onChange({ ...data, [field]: value });
  return (
    <div className="min-w-0 flex-1 space-y-2 text-sm">
      <input
        value={data.company}
        onChange={(e) => set('company', e.target.value)}
        placeholder="会社名"
        aria-label="会社名"
        className="w-full rounded border border-input bg-background px-2 py-1 font-medium focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex items-center gap-1.5">
        <DateTokenPicker value={data.startDate} onChange={(v) => set('startDate', v)} placeholder="開始年月日" />
        <span className="text-muted-foreground text-xs">〜</span>
        <DateTokenPicker
          value={data.endDate}
          onChange={(v) => set('endDate', v)}
          placeholder="終了年月日"
          allowPresent
        />
      </div>
      <input
        value={data.role}
        onChange={(e) => set('role', e.target.value)}
        placeholder="職種（例: フロントエンドエンジニア）"
        aria-label="職種"
        className="w-full min-h-11 rounded border border-input bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <textarea
        value={data.description}
        onChange={(e) => set('description', e.target.value)}
        rows={4}
        placeholder="業務内容"
        aria-label="業務内容"
        className="w-full min-h-11 resize-y rounded border border-input bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
};
