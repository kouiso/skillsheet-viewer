// エディタ上のブロック（EditorItem）と、DB 保存形式（BlockInput）／プレビュー用
// Markdown ／ dirty 比較用スナップショットの相互変換をまとめたモジュール。
// builder-client.tsx から切り出した（Issue #270）。振る舞いは変えていない。

// tableBlockToMarkdown 等の純関数/型はサーバ専用モジュール（neon ドライバ等）を
// client バンドルに巻き込まないため、root の @/db ではなく純粋サブエクスポート
// @/db/blocks から import する。
import {
  type Block,
  type BlockInput,
  blockJoinSeparator,
  type ExperienceBlockData,
  experienceBlockToMarkdown,
  isBlockInputEmpty,
  type ProfileBlockData,
  type ProjectBlockData,
  profileBlockToMarkdown,
  projectBlockToMarkdown,
  type SkillEntry,
  type StatsBlockData,
  skillsBlockToMarkdown,
  statsBlockToMarkdown,
  type TableColumn,
  tableBlockToMarkdown,
} from '@/db/blocks';
import { sanitizeMarkdown } from '@/db/sanitize-html';

// エディタ上のブロック。type と内容を一致させた判別ユニオン（DB の Block に対応）。
export type EditorItem =
  | { id: string; type: 'markdown'; markdown: string }
  | { id: string; type: 'table'; columns: TableColumn[]; rows: string[][] }
  | { id: string; type: 'skills'; category: string; skills: SkillEntry[] }
  | ({ id: string; type: 'experience' } & ExperienceBlockData)
  | ({ id: string; type: 'profile' } & ProfileBlockData)
  | { id: string; type: 'stats'; data: StatsBlockData }
  | { id: string; type: 'project'; data: ProjectBlockData };

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `b-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// 初期ブロックの ID は SSR/CSR で一致させるためインデックス基準の安定値にする
// （newId() は乱数/時刻依存でハイドレーション不整合を起こす）。追加ブロックのみ newId()。
export const blockToItem = (block: Block, index: number): EditorItem => {
  const id = `block-${index}`;
  switch (block.type) {
    case 'markdown':
      return { id, type: 'markdown', markdown: block.data.markdown };
    case 'table':
      return { id, type: 'table', columns: block.data.columns, rows: block.data.rows };
    case 'skills':
      return { id, type: 'skills', category: block.data.category, skills: block.data.skills };
    case 'experience':
      return { id, type: 'experience', ...block.data };
    case 'profile':
      return { id, type: 'profile', ...block.data };
    case 'stats':
      return { id, type: 'stats', data: block.data };
    case 'project':
      return { id, type: 'project', data: block.data };
  }
};

export const itemToBlockInput = (item: EditorItem): BlockInput => {
  switch (item.type) {
    case 'markdown':
      return { type: 'markdown', data: { markdown: item.markdown } };
    case 'table':
      return { type: 'table', data: { columns: item.columns, rows: item.rows } };
    case 'skills':
      return { type: 'skills', data: { category: item.category, skills: item.skills } };
    case 'experience': {
      const { company, startDate, endDate, role, description } = item;
      return { type: 'experience', data: { company, startDate, endDate, role, description } };
    }
    case 'profile': {
      const { name, title, pr, strengths, meta, company } = item;
      // strengths はエディタ上で改行区切り編集するため、保存時に空行を除去する
      return {
        type: 'profile',
        data: { name, title, pr, strengths: strengths.filter((s) => s.trim()), meta, company },
      };
    }
    case 'stats':
      return { type: 'stats', data: item.data };
    case 'project':
      return { type: 'project', data: item.data };
  }
};

// 1 ブロックを markdown 文字列へ（table/skills/experience は GFM 表・セクションへ変換）。
// includeHidden はバックアップ書き出し用（hidden な会社・案件も欠落させない）。
export const itemToMarkdown = (item: EditorItem, opts?: { includeHidden?: boolean }): string => {
  switch (item.type) {
    case 'markdown':
      return sanitizeMarkdown(item.markdown);
    case 'table':
      return tableBlockToMarkdown({ columns: item.columns, rows: item.rows });
    case 'skills':
      return skillsBlockToMarkdown({ category: item.category, skills: item.skills });
    case 'experience': {
      const { company, startDate, endDate, role, description } = item;
      return experienceBlockToMarkdown({ company, startDate, endDate, role, description });
    }
    case 'profile': {
      const { name, title, pr, strengths, meta, company } = item;
      return profileBlockToMarkdown({ name, title, pr, strengths: strengths.filter((s) => s.trim()), meta, company });
    }
    case 'stats':
      return statsBlockToMarkdown(item.data);
    case 'project':
      return projectBlockToMarkdown(item.data, opts);
  }
};

// 連結規則はサーバ側 blocksToMarkdown と共有の blockJoinSeparator に一元化する。
// 手コピーで 2 箇所に規則が重複していたのを解消し、markdown 分割の無損失性と
// GFM テーブルが直前段落へ lazy continuation として飲み込まれない区切りを両立する。
export const assembleMarkdown = (items: EditorItem[], opts?: { includeHidden?: boolean }): string => {
  let result = '';
  let prev: EditorItem | undefined;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    // 中身が空のブロックはプレビュー/エクスポートにも出さない（viewer の groupBlocks・
    // サーバ側 blocksToMarkdown と揃える）。markdown 計算前・prev 更新前に skip すること
    // — 後から continue すると直前ブロック判定（blockJoinSeparator / 先頭判定）が
    // スキップされた要素を指してしまう。
    if (isBlockInputEmpty(itemToBlockInput(item))) continue;
    const markdown = itemToMarkdown(item, opts);
    // items[i - 1] を位置で参照すると sparse 配列（途中の undefined 要素）で
    // 実際に直前にレンダリングされたブロックを見失う。実際にレンダリングした
    // 直前アイテムを prev で追跡し、先頭要素の判定も prev の有無で行う。
    result += prev === undefined ? markdown : blockJoinSeparator(prev.type, item.type, markdown) + markdown;
    prev = item;
  }
  return result;
};

// dirty 比較用スナップショット（タイトル＋保存 payload と同形の構造化 BlockInput）。
// markdown 比較だと markdown に落ちないフィールド（profile.company / 会社 kind・note /
// 案件 comment・summary / hidden トグル等）の編集を取りこぼし、自動保存も
// beforeunload ガードも発火せず黙ってデータが失われるため、保存される構造化データで差分を見る。
// サーバはもう空ブロックを drop しない（issue #128）ので、ここも空ブロックを含めて
// 保存 payload と完全一致させる。全ブロックが空のときの dirty 抑制は isDirty 計算側の
// allEmpty ガードで別途行う（全消しの是非は手動保存の confirm に委ねる）。
export const snapshot = (items: EditorItem[], title: string): string =>
  JSON.stringify([title, items.map(itemToBlockInput)]);
