/**
 * スキルシートの「ブロック」データモデル。
 *
 * DB（Neon）を正本とし、スキルシートを順序付きブロック配列として表現する。
 * #21 の読み取り経路 MVP では汎用 `markdown` ブロックのみを扱い、既存の
 * react-markdown レンダラと PDF レンダラをそのまま再利用する。
 * #22（D&Dビルダー）で型付きブロック（年数表・プロジェクトカード等）を追加する。
 */

export type BlockType = 'markdown';

export interface MarkdownBlockData {
  markdown: string;
}

export interface Block {
  /** DB の行 ID（新規ブロックはクライアントで採番せずサーバ採番でも可） */
  id: string;
  type: BlockType;
  /** 0 始まりの表示順 */
  order: number;
  data: MarkdownBlockData;
}

// 構造境界: レベル2〜4の見出し、または <details> ブロックの開始行。
// ここでドキュメントを分割し、各セクションを 1 ブロックとする。
const BLOCK_BOUNDARY = /^(?:#{2,4}\s|<details[\s>])/;

/**
 * Markdown 文書を構造境界でブロック配列へ分割する（テキストは無損失）。
 * 連結（blocksToMarkdown）すると元の文書と一致する。
 */
export function splitMarkdownIntoBlocks(markdown: string): MarkdownBlockData[] {
  const lines = markdown.split('\n');
  const segments: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length > 0) {
      segments.push(current.join('\n'));
      current = [];
    }
  };

  for (const line of lines) {
    if (BLOCK_BOUNDARY.test(line) && current.length > 0) {
      flush();
    }
    current.push(line);
  }
  flush();

  return segments.map((markdown) => ({ markdown }));
}

/** ブロック配列を order 昇順で 1 つの Markdown 文書へ連結する。 */
export function blocksToMarkdown(blocks: Block[]): string {
  return [...blocks]
    .sort((a, b) => a.order - b.order)
    .map((b) => b.data.markdown)
    .join('\n');
}
