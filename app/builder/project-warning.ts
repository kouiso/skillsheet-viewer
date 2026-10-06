import { isProjectBlockData, type ProjectItem } from '@/db/block';
import { type RawDocumentBlock, validateDocumentBlocks } from '@/db/document-contract';
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

/** 保存処理と同じ正本診断から、案内先となる期間を案件単位でまとめる。 */
export function projectBlockingWarnings(blocks: readonly RawDocumentBlock[]) {
  const result: { blockId: string; projectId: string; field: 'period'; target: string }[] = [];
  const seen = new Set<string>();
  for (const issue of validateDocumentBlocks(blocks)) {
    if (issue.code !== 'PERIOD_PROJECTION_MISMATCH') continue;
    const match = /^data\.items\[(\d+)\]\.(periodStart|periodEnd|ongoing)$/.exec(issue.path);
    const block = blocks.find((candidate) => candidate.id === issue.blockId);
    if (!match || block?.type !== 'project' || !isProjectBlockData(block.data)) continue;
    const project = block.data.items[Number(match[1])];
    if (!project) continue;
    const key = `${block.id}:${project.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      blockId: block.id,
      projectId: project.id,
      field: 'period',
      target: match[2] === 'periodEnd' ? 'input[aria-label="終了月"]' : 'input[aria-label="開始月"]',
    });
  }
  return result;
}

/** 単一フォームでも保存と同じ期間診断を使い、旧形式の明示投影を見落とさない。 */
export function projectHasBlockingPeriod(project: ProjectItem): boolean {
  return (
    projectBlockingWarnings([
      { id: 'period-validation', type: 'project', order: 0, data: { companies: [], items: [project] } },
    ]).length > 0
  );
}
