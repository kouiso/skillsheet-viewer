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

/** インライン強調 `**…**` を外す。独立段落の小見出し行は残す。対にならない `**` は残さない。 */
export function unwrapEmphasis(text: string): string {
  const lines = text.split('\n');
  const isBoundary = (line?: string) => line === undefined || line.trim().length === 0;
  return lines
    .map((line, i) => {
      // 行全体が `**…**` だけで、前後が空行か本文の端にある行は、案件コメント内で
      // 話題を分ける小見出し（「**バックエンド**」等）なので残す。外すと本文と同じ
      // 見た目になり切れ目が読めなくなる（#292）。
      // 段落の途中に置かれた太字行は、描画側の collapseSoftBreaks で本文に連結されて
      // 段落先頭の文中太字になるため、小見出しとはみなさず外す。
      const boldOnly = line.replace(/\*\*[^*]+\*\*/g, '').trim().length === 0;
      if (boldOnly && isBoundary(lines[i - 1]) && isBoundary(lines[i + 1])) return line;
      // 対になった強調を外したあと、閉じ忘れた `**` が本文に残ると
      // 画面にも PDF にも `**` がそのまま出てしまうため、残余も取り除く。
      return line.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*\*/g, '');
    })
    .join('\n');
}
