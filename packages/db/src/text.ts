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

/** インライン強調 `**…**` を外す。対にならない `**` は残さない。 */
export function unwrapEmphasis(text: string): string {
  // 対になった強調を外したあと、閉じ忘れた `**` が本文に残ると
  // 画面にも PDF にも `**` がそのまま出てしまうため、残余も取り除く。
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*\*/g, '');
}
