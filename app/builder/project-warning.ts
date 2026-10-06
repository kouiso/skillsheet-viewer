import type { ProjectItem } from '@/db/block';
import { parsePeriodToRange } from '@/db/process';

export function projectWarnings(project: ProjectItem): { field: 'title' | 'period'; target: string }[] {
  const warnings: { field: 'title' | 'period'; target: string }[] = [];
  if (!project.title.trim()) warnings.push({ field: 'title', target: 'input' });
  const parsed = parsePeriodToRange(project.period);
  const start = project.periodStart ?? parsed?.start ?? '';
  const end = project.periodEnd ?? parsed?.end ?? '';
  const ongoing = project.ongoing ?? parsed?.ongoing ?? false;
  const legacyUnparsable = project.periodStart === undefined && parsed === null && project.period.trim().length > 0;
  if (!start && !legacyUnparsable) warnings.push({ field: 'period', target: 'input[aria-label="開始月"]' });
  else if (start && !ongoing && (!end || end < start))
    warnings.push({ field: 'period', target: 'input[aria-label="終了月"]' });
  else if (parsed && (start !== parsed.start || end !== parsed.end || ongoing !== parsed.ongoing))
    warnings.push({ field: 'period', target: 'input[aria-label="開始月"]' });
  return warnings;
}
