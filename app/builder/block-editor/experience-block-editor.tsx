'use client';

import { DateTokenPicker } from '@/component/date-token-picker';
import type { ExperienceBlockData } from '@/db/block';
import { EXPERIENCE_FIELD_LABELS } from '../field-label';

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
        placeholder={EXPERIENCE_FIELD_LABELS.company}
        aria-label={EXPERIENCE_FIELD_LABELS.company}
        className="min-h-11 w-full rounded border border-input bg-background px-2 py-1 font-medium focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex items-center gap-1.5">
        <DateTokenPicker
          value={data.startDate}
          onChange={(v) => set('startDate', v)}
          placeholder={EXPERIENCE_FIELD_LABELS.startDate}
        />
        <span className="text-muted-foreground text-xs">〜</span>
        <DateTokenPicker
          value={data.endDate}
          onChange={(v) => set('endDate', v)}
          placeholder={EXPERIENCE_FIELD_LABELS.endDate}
          allowPresent
        />
      </div>
      <input
        value={data.role}
        onChange={(e) => set('role', e.target.value)}
        placeholder="職種（例: フロントエンドエンジニア）"
        aria-label={EXPERIENCE_FIELD_LABELS.role}
        className="w-full min-h-11 rounded border border-input bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <textarea
        value={data.description}
        onChange={(e) => set('description', e.target.value)}
        rows={4}
        placeholder={EXPERIENCE_FIELD_LABELS.description}
        aria-label={EXPERIENCE_FIELD_LABELS.description}
        className="w-full min-h-11 resize-y rounded border border-input bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
};
