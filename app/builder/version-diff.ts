import {
  BLOCK_TYPE_LABELS,
  COMPANY_FIELD_LABELS,
  DOCUMENT_TITLE_LABEL,
  EXPERIENCE_FIELD_LABELS,
  MARKDOWN_FIELD_LABELS,
  PROFILE_FIELD_LABELS,
  PROJECT_FIELD_LABELS,
  profileMetaLabel,
  SKILL_FIELD_LABELS,
  STAT_FIELD_LABELS,
  TABLE_FIELD_LABELS,
  TECH_FIELD_LABELS,
} from './field-labels';

/** 版の差分の1項目。場所は人が読む語の並び（添字・内部IDは含めない）。 */
export interface DocumentDifference {
  /** React の key 用。画面には出さない。 */
  key: string;
  /** 例: ['株式会社A', '決済基盤の開発', '担当業務']。画面では「 › 」でつなぐ。 */
  location: string[];
  before: string;
  after: string;
}
export interface DiffRoot {
  title: unknown;
  blocks: unknown;
}

type Path = (string | number)[];
type Side = 'before' | 'after';
type Roots = Record<Side, DiffRoot>;
type Rec = Record<string, unknown>;

const NONE = '（なし）';
const EMPTY = '（空）';

const isRec = (v: unknown): v is Rec => v !== null && typeof v === 'object' && !Array.isArray(v);
const isPrimitive = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const child = (v: unknown, key: string | number): unknown =>
  Array.isArray(v) ? v[Number(key)] : isRec(v) ? v[String(key)] : undefined;
const at = (root: unknown, path: Path) => path.reduce<unknown>((value, key) => child(value, key), root);
const name = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v : fallback);

const isBlockPath = (path: Path) => path.length === 2 && path[0] === 'blocks';
const isEntityPath = (path: Path) =>
  isBlockPath(path) ||
  (path.length === 5 && path[0] === 'blocks' && path[2] === 'data' && (path[3] === 'companies' || path[3] === 'items'));

// 保存のたびに変わりうる内部の識別子と並び番号。読む人に意味が無いので差分に出さない。
const hiddenKey = (path: Path, key: string) =>
  (key === 'id' && isEntityPath(path)) || (key === 'order' && isBlockPath(path));

// 文字列だけの配列（技術・工程・強み）は1項目として比べる。表の行は、セル1つずつ比べる。
const leafArray = (v: unknown, path: Path) =>
  Array.isArray(v) && v.length > 0 && v.every(isPrimitive) && path[path.length - 2] !== 'rows';
const container = (v: unknown, path: Path) => isRec(v) || (Array.isArray(v) && !leafArray(v, path));

interface Leaf {
  /** 前の文書での位置。前に無い項目は undefined。 */
  bp: Path | undefined;
  /** 後の文書での位置。後に無い項目は undefined。 */
  ap: Path | undefined;
  before: unknown;
  after: unknown;
  /** 並び順の変更のように、場所と値を作ってから渡す項目。 */
  fixed?: { location: string[]; before: string; after: string };
}

// ブロック・会社・案件は、保存のたびに添字がずれる（先頭を消す・途中に足す）ので、添字でなく id で対にする。
const isIdArrayPath = (path: Path) =>
  (path.length === 1 && path[0] === 'blocks') ||
  (path.length === 4 && path[0] === 'blocks' && path[2] === 'data' && (path[3] === 'companies' || path[3] === 'items'));
const idOf = (v: unknown) => (isRec(v) && typeof v.id === 'string' ? v.id : undefined);
const hasIds = (v: unknown) => Array.isArray(v) && (v.length === 0 || v.every((e) => idOf(e) !== undefined));

function entityName(path: Path, v: unknown): string {
  if (path[0] === 'blocks' && path.length === 1) {
    const type = String(child(v, 'type'));
    const label = BLOCK_TYPE_LABELS[type] ?? type;
    const data = child(v, 'data');
    const detail =
      type === 'markdown'
        ? String(child(data, 'markdown') ?? '')
            .split('\n')
            .map((l) => l.replace(/^[#\s]+/, '').trim())
            .find(Boolean)
        : type === 'skills'
          ? name(child(data, 'category'), '')
          : type === 'experience'
            ? name(child(data, 'company'), '')
            : type === 'profile'
              ? name(child(data, 'name'), '')
              : '';
    return detail ? `${label}（${detail}）` : label;
  }
  if (path[3] === 'companies') return name(child(v, 'name'), '(会社名未入力)');
  return name(child(v, 'title'), '（案件名未入力）');
}
const ORDER_LABEL: Record<string, string> = {
  blocks: 'ブロックの並び順',
  companies: '会社の並び順',
  items: '案件の並び順',
};

function collect(
  before: unknown,
  after: unknown,
  bp: Path | undefined,
  ap: Path | undefined,
  out: Leaf[],
  inherited = false,
) {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const path = (ap ?? bp) as Path;
  const defined = [before, after].filter((v) => v !== undefined);
  if (defined.every((v) => container(v, path) || (Array.isArray(v) && v.length === 0))) {
    // 片側にそのまとまりが無い時（追加・削除）は、その下の空の項目を並べない。
    const oneSided = inherited || before === undefined || after === undefined;
    const sub = (v: unknown, p: Path | undefined, key: string | number) =>
      child(v, key) === undefined || p === undefined ? undefined : ([...p, key] as Path);
    if (isIdArrayPath(path) && hasIds(before ?? []) && hasIds(after ?? [])) {
      const b = (Array.isArray(before) ? before : []) as unknown[];
      const a = (Array.isArray(after) ? after : []) as unknown[];
      const pairs: [number | undefined, number | undefined][] = a.map((e, ai) => {
        const bi = b.findIndex((x) => idOf(x) === idOf(e));
        return [bi < 0 ? undefined : bi, ai];
      });
      b.forEach((e, bi) => {
        if (!a.some((x) => idOf(x) === idOf(e))) pairs.push([bi, undefined]);
      });
      for (const [bi, ai] of pairs)
        collect(
          bi === undefined ? undefined : b[bi],
          ai === undefined ? undefined : a[ai],
          bi === undefined || bp === undefined ? undefined : [...bp, bi],
          ai === undefined || ap === undefined ? undefined : [...ap, ai],
          out,
          oneSided,
        );
      // 並べ替えだけの変更も隠さない（共通の項目の並びを前後で比べる）。
      const inBoth = (e: unknown, other: unknown[]) => other.some((x) => idOf(x) === idOf(e));
      const order = (list: unknown[], other: unknown[]) => list.filter((e) => inBoth(e, other));
      const orderB = order(b, a);
      const orderA = order(a, b);
      if (JSON.stringify(orderB.map(idOf)) !== JSON.stringify(orderA.map(idOf))) {
        const names = (list: unknown[]) => list.map((e) => entityName(path, e)).join('\n');
        const label = ORDER_LABEL[String(path[path.length - 1])];
        out.push({
          bp,
          ap,
          before: undefined,
          after: undefined,
          fixed: { location: [label], before: names(orderB), after: names(orderA) },
        });
      }
      return;
    }
    const keys = new Set<string | number>();
    for (const side of [before, after]) {
      if (Array.isArray(side)) for (let i = 0; i < side.length; i++) keys.add(i);
      else if (isRec(side)) for (const k of Object.keys(side)) if (!hiddenKey(path, k)) keys.add(k);
    }
    for (const key of keys)
      collect(child(before, key), child(after, key), sub(before, bp, key), sub(after, ap, key), out, oneSided);
    return;
  }
  // 追加・削除されたまとまりの中で、片側が「なし」でもう片側が空文字・空配列だけの項目は、読む内容が無いので並べない。
  // まとまりが両方にある時の「なし → 空」は実際の変更なので隠さない。
  const empty = (v: unknown) => v === '' || (Array.isArray(v) && v.length === 0);
  if (inherited && ((before === undefined && empty(after)) || (after === undefined && empty(before)))) return;
  out.push({ bp, ap, before, after });
}

const BOOLEAN_WORDS: Record<string, [string, string]> = {
  hidden: ['表示', '非表示'],
  ongoing: ['終了済み', '継続中'],
  featured: ['推しではない', '推し'],
};
const KIND_WORDS: Record<string, string> = {
  experience: '案件から経験年数を計算',
  projectCount: '案件数を計算',
  free: '手入力',
};
const ALIGN_WORDS: Record<string, string> = { left: '左', center: '中央', right: '右' };

type Format = (value: unknown, side: Side) => string;
interface Described {
  location: string[];
  format?: Format;
}

function plain(value: unknown, key: string): string {
  if (value === undefined || value === null) return NONE;
  if (typeof value === 'boolean') return BOOLEAN_WORDS[key]?.[value ? 1 : 0] ?? (value ? 'はい' : 'いいえ');
  if (typeof value === 'string') return value === '' ? EMPTY : value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value))
    return value.length === 0 ? EMPTY : value.map((v) => plain(v, key)).join(key === 'strengths' ? '\n' : '、');
  // 想定外の入れ子は、JSON にせず「項目: 値」の行で読める形にする。
  return Object.entries(value as Rec)
    .filter(([k]) => k !== 'id')
    .map(([k, v]) => `${k}: ${plain(v, k)}`)
    .join('\n');
}

function describeBlock(
  path: Path,
  side: Side,
  paths: Record<Side, Path | undefined>,
  roots: Roots,
  block: Rec,
): Described {
  const type = String(block.type);
  const typeLabel = BLOCK_TYPE_LABELS[type] ?? type;
  const data = (s: Side = side) => {
    const p = paths[s];
    return p ? at(roots[s], p.slice(0, 3)) : undefined;
  };
  const field = path.slice(3);
  const key = String(field[field.length - 1]);

  if (type === 'markdown') {
    const first = String(child(data(), 'markdown') ?? '')
      .split('\n')
      .map((l) => l.replace(/^[#\s]+/, '').trim())
      .find(Boolean);
    return { location: [typeLabel, ...(first ? [first] : []), MARKDOWN_FIELD_LABELS.markdown] };
  }
  if (type === 'skills') {
    if (field[0] === 'skills') {
      const skill = child(child(data(), 'skills'), field[1] as number);
      const label = SKILL_FIELD_LABELS[key as keyof typeof SKILL_FIELD_LABELS] ?? key;
      return {
        location: [
          typeLabel,
          name(child(data(), 'category'), '（カテゴリ名なし）'),
          name(child(skill, 'name'), '（スキル名なし）'),
          label,
        ],
      };
    }
    return { location: [typeLabel, SKILL_FIELD_LABELS.category] };
  }
  if (type === 'experience') {
    const label = EXPERIENCE_FIELD_LABELS[key as keyof typeof EXPERIENCE_FIELD_LABELS] ?? key;
    return {
      location: [typeLabel, name(child(data(), 'company'), '（会社名なし）'), label],
      format: (v) => (key === 'endDate' && v === '' ? '現在' : plain(v, key)),
    };
  }
  if (type === 'profile') {
    const label =
      field[0] === 'meta' && field.length > 1
        ? profileMetaLabel(String(field[1]))
        : (PROFILE_FIELD_LABELS[key as keyof typeof PROFILE_FIELD_LABELS] ?? key);
    return { location: [typeLabel, label] };
  }
  if (type === 'stats') {
    const item = child(child(data(), 'items'), field[1] as number);
    const label = STAT_FIELD_LABELS[key as keyof typeof STAT_FIELD_LABELS] ?? key;
    return {
      location: [typeLabel, name(child(item, 'label'), '（ラベルなし）'), label],
      format: (v) => (key === 'kind' && typeof v === 'string' ? (KIND_WORDS[v] ?? v) : plain(v, key)),
    };
  }
  if (type === 'table') {
    const columns = (s: Side = side) => child(data(s), 'columns');
    const labels = (Array.isArray(columns()) ? (columns() as unknown[]) : [])
      .map((c) => child(c, 'label'))
      .filter((l): l is string => typeof l === 'string' && l !== '');
    const table = labels.length > 0 ? `${typeLabel}（${labels.join('・')}）` : typeLabel;
    if (field[0] === 'columns') {
      const label = TABLE_FIELD_LABELS[key as keyof typeof TABLE_FIELD_LABELS] ?? key;
      return {
        location: [table, `列 ${Number(field[1]) + 1}`, label],
        format: (v) => (key === 'align' && typeof v === 'string' ? (ALIGN_WORDS[v] ?? v) : plain(v, key)),
      };
    }
    const column = name(child(child(columns(), field[2] as number), 'label'), `列 ${Number(field[2]) + 1}`);
    return { location: [table, `${Number(field[1]) + 1}行目`, column] };
  }
  if (type === 'project') {
    const companies = (s: Side = side) => {
      const list = child(data(s), 'companies');
      return Array.isArray(list) ? list : [];
    };
    const companyName = (s: Side, id: unknown) =>
      name(
        child(
          companies(s).find((c) => child(c, 'id') === id),
          'name',
        ),
        '(会社名未入力)',
      );
    if (field[0] === 'companies') {
      const company = companies()[Number(field[1])];
      const label = COMPANY_FIELD_LABELS[key as keyof typeof COMPANY_FIELD_LABELS] ?? key;
      return { location: ['会社', name(child(company, 'name'), '(会社名未入力)'), label] };
    }
    if (field[0] === 'items') {
      const item = child(child(data(), 'items'), field[1] as number);
      const label =
        field[2] === 'tech'
          ? (TECH_FIELD_LABELS[key as keyof typeof TECH_FIELD_LABELS] ?? key)
          : (PROJECT_FIELD_LABELS[key as keyof typeof PROJECT_FIELD_LABELS] ?? key);
      return {
        location: [companyName(side, child(item, 'companyId')), name(child(item, 'title'), '（案件名未入力）'), label],
        format: (v, s) =>
          key === 'companyId' && field.length === 3 && v !== undefined ? companyName(s, v) : plain(v, key),
      };
    }
  }
  return { location: [typeLabel, ...field.map(String)] };
}

function describe(leaf: Leaf, roots: Roots): { location: string[]; before: string; after: string } {
  if (leaf.fixed) return leaf.fixed;
  // 値のある側の文書で場所を引く。追加された項目は後、削除された項目は前の文書にしか無い。
  const side: Side = leaf.after !== undefined ? 'after' : 'before';
  const paths: Record<Side, Path | undefined> = { before: leaf.bp, after: leaf.ap };
  const path = (paths[side] ?? []) as Path;
  const key = String(path[path.length - 1]);
  let described: Described = { location: path.map(String) };
  if (path[0] === 'title') described = { location: ['シート', DOCUMENT_TITLE_LABEL] };
  else if (path[0] === 'blocks') {
    const block = at(roots[side], ['blocks', path[1]]);
    if (path[2] === 'type') {
      described = {
        location: ['ブロックの種類'],
        format: (v) => (typeof v === 'string' ? (BLOCK_TYPE_LABELS[v] ?? v) : plain(v, key)),
      };
    } else if (path[2] === 'data' && isRec(block)) described = describeBlock(path, side, paths, roots, block);
    else described = { location: ['ブロック', ...path.slice(2).map(String)] };
  }
  const format = described.format ?? ((v: unknown) => plain(v, key));
  return {
    location: described.location,
    before: format(leaf.before, 'before'),
    after: format(leaf.after, 'after'),
  };
}

/**
 * 2つの版の差分を、場所・前・後の組で返す。原文を省略せず、変わった項目は全部返す。
 * 場所は会社名・案件名・スキル名などの語で示し、項目名は編集画面と同じ対応表（field-labels.ts）から引く。
 * 値は JSON にせず、文字列はそのまま（引用符なし・改行はそのまま）。
 */
export function documentDifferences(before: DiffRoot, after: DiffRoot): DocumentDifference[] {
  const leaves: Leaf[] = [];
  collect(before, after, [], [], leaves);
  const roots: Roots = { before, after };
  return leaves.map((leaf) => ({
    key: `${leaf.bp?.join('.') ?? ''}|${leaf.ap?.join('.') ?? ''}|${leaf.fixed?.location[0] ?? ''}`,
    ...describe(leaf, roots),
  }));
}

export const formatLocation = (location: readonly string[]) => location.join(' › ');
