// `+` も Markdown の箇条書き記号。落とすと `+ 項目1` / `+ 項目2` が1行に連結される。
const LIST_LINE = /^\s*(?:[-+*•]|\d+[.)])\s/;
const SETEXT_UNDERLINE = /^\s*(?:={2,}|-{3,})\s*$/;

/** 段落内の単独改行を空白に潰す。空行は段落、リスト行と Setext 下線は行のまま残す。 */
export function collapseSoftBreaks(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((para) => {
      const out: string[] = [];
      for (const raw of para.split('\n')) {
        const line = raw.trim();
        if (line.length === 0) continue;
        const prev = out[out.length - 1] ?? '';
        if (out.length === 0 || LIST_LINE.test(line) || SETEXT_UNDERLINE.test(line) || SETEXT_UNDERLINE.test(prev)) {
          out.push(line);
          continue;
        }
        out[out.length - 1] = `${prev} ${line}`;
      }
      return out.join('\n');
    })
    .join('\n\n');
}

// 行全体が `**…**` だけの行は、案件コメントで話題の切れ目を示す小見出し
// （「バックエンド」「フロントエンド」等）として使われている（Issue #292）。
// 一括で外すと見出しと地の文が同じ見た目になり、切れ目が読めなくなるため、
// この行だけは対象から除く。
//
// 小見出しには箇条書き記号・番号（`collapseSoftBreaks` の LIST_LINE と同じ記号セット）
// が前置されることがあるため、判定前にその装飾だけを剥がす（アダーサリアルレビュー
// 指摘 / Issue #292）。太字の後ろに説明文が続く行（例: `**バックエンド**：ここから詳細`）
// は対象にしない — そこまで対象を広げると、Issue #292 の完了条件にある
// 「文の途中に入った太字は外れる」と衝突し、本文中の太字注記まで見出し扱いで
// 残ってしまうため（実データ未確認の想定ケースを理由に、確認済みの完了条件を破れない）。
// `\s*`（空白省略可）にすると `*` 単体が `**バックエンド**` 先頭の `*` 1文字にマッチしてしまい、
// 太字の開始記号を箇条書き記号として食い荒らして判定を壊す（`LIST_LINE` と同じく空白必須にして回避）。
const HEADING_LIST_PREFIX = /^(?:[-+*•]|\d+[.)])\s+/;
const WHOLE_LINE_BOLD = /^\*\*([^*]+)\*\*$/;

function isWholeLineBoldHeading(line: string): boolean {
  const withoutPrefix = line.trim().replace(HEADING_LIST_PREFIX, '');
  return WHOLE_LINE_BOLD.test(withoutPrefix);
}

/** インライン強調 `**…**` を外す。行全体が太字だけの行（小見出し）は残し、対にならない `**` は残さない。 */
export function unwrapEmphasis(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (isWholeLineBoldHeading(line)) return line;
      // 対になった強調を外したあと、閉じ忘れた `**` が本文に残ると
      // 画面にも PDF にも `**` がそのまま出てしまうため、残余も取り除く。
      return line.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*\*/g, '');
    })
    .join('\n');
}
