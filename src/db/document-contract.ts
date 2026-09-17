import { isBlockInput } from './blocks';
import { parsePeriodToRange } from './process';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxRevision = 9223372036854775807n;

/** JSONの意味比較用。文字列・配列順・nullと欠落は変更しない。 */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  function visit(item: unknown): string {
    if (item === null) return 'null';
    if (typeof item === 'string' || typeof item === 'boolean') return JSON.stringify(item);
    if (typeof item === 'number' && Number.isFinite(item)) return JSON.stringify(item);
    if (typeof item !== 'object' || item === null || ancestors.has(item)) throw new Error('INVALID_JSON');
    ancestors.add(item);
    try {
      if (Array.isArray(item)) return `[${Array.from(item, visit).join(',')}]`;
      if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
        throw new Error('INVALID_JSON');
      }
      return `{${Object.keys(item)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${visit((item as Record<string, unknown>)[key])}`)
        .join(',')}}`;
    } finally {
      ancestors.delete(item);
    }
  }
  return visit(value);
}

export function isRevision(value: unknown): value is string {
  return (
    typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && value.length <= 19 && BigInt(value) <= maxRevision
  );
}

export interface RawDocumentBlock {
  id: string;
  type: string;
  order: number;
  data: unknown;
}

export interface DocumentIssue {
  blockId: string;
  path: string;
  code: 'INVALID_DATA' | 'UNKNOWN_FIELD' | 'INVALID_ORDER' | 'INVALID_ID' | 'PERIOD_PROJECTION_MISMATCH';
}

// 型ガードは型検証の正本。ここでは編集UIが扱うkeyの境界を補完する。
type Shape = true | { [key: string]: Shape } | readonly [Shape];
const shapes: Record<string, Shape> = {
  markdown: { markdown: true },
  table: { columns: [{ label: true, align: true }], rows: true },
  skills: { category: true, skills: [{ name: true, years: true, level: true, featured: true }] },
  experience: { company: true, startDate: true, endDate: true, role: true, description: true },
  profile: { name: true, title: true, pr: true, strengths: true, meta: true, company: true },
  stats: { items: [{ value: true, unit: true, label: true }] },
  project: {
    companies: [{ id: true, name: true, kind: true, period: true, note: true, hidden: true }],
    items: [
      {
        id: true,
        companyId: true,
        title: true,
        scope: true,
        period: true,
        role: true,
        team: true,
        tech: { lang: true, fw: true, db: true, infra: true, tools: true, collab: true },
        process: true,
        duties: true,
        acquired: true,
        comment: true,
        summary: true,
        duration: true,
        hidden: true,
        periodStart: true,
        periodEnd: true,
        ongoing: true,
      },
    ],
  },
};

/** rawは返却・退避のため保持する。未知項目を削って編集可能にしない。 */
export function validateDocumentBlocks(blocks: readonly RawDocumentBlock[]): DocumentIssue[] {
  const issues: DocumentIssue[] = [];
  const ids = new Set<string>();
  for (const [index, block] of blocks.entries()) {
    const add = (path: string, code: DocumentIssue['code']) => issues.push({ blockId: block.id, path, code });
    if (!uuid.test(block.id) || ids.has(block.id.toLowerCase())) add('id', 'INVALID_ID');
    ids.add(block.id.toLowerCase());
    if (block.order !== index) add('order', 'INVALID_ORDER');
    try {
      canonicalJson(block.data);
    } catch {
      add('data', 'INVALID_DATA');
      continue;
    }
    if (!isBlockInput(block)) {
      add('data', 'INVALID_DATA');
      continue;
    }
    function check(value: unknown, shape: Shape, path: string): void {
      if (shape === true) return;
      if (Array.isArray(shape)) {
        if (Array.isArray(value)) {
          value.forEach((item, i) => {
            check(item, shape[0], `${path}[${i}]`);
          });
        }
        return;
      }
      if (value === null || typeof value !== 'object') return;
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(shape, key)) add(`${path}.${key}`, 'UNKNOWN_FIELD');
        else check((value as Record<string, unknown>)[key], (shape as Record<string, Shape>)[key], `${path}.${key}`);
      }
    }
    check(block.data, shapes[block.type], 'data');
    if (block.type === 'table' && block.data.rows.some((row) => row.length !== block.data.columns.length)) {
      add('data.rows', 'INVALID_DATA');
    }
    if (block.type === 'project') {
      block.data.items.forEach((item, i) => {
        const projection = parsePeriodToRange(item.period);
        for (const [key, expected] of [
          ['periodStart', projection?.start],
          ['periodEnd', projection?.end],
          ['ongoing', projection?.ongoing],
        ] as const) {
          if (Object.hasOwn(item, key) && (!projection || item[key] !== expected)) {
            add(`data.items[${i}].${key}`, 'PERIOD_PROJECTION_MISMATCH');
          }
        }

        for (const key of ['summary', 'duration'] as const) {
          if (Object.hasOwn(item, key) && typeof item[key] !== 'string') add(`data.items[${i}].${key}`, 'INVALID_DATA');
        }
      });
    }
  }
  return issues;
}
