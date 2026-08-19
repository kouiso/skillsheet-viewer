const LIST_LINE = /^\s*(?:[-*•]|\d+[.)])\s/;

/** 段落内の単独改行を空白に潰す。空行は段落、リスト行は行のまま残す。 */
export function collapseSoftBreaks(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((para) => {
      const out: string[] = [];
      for (const raw of para.split('\n')) {
        const line = raw.trim();
        if (line.length === 0) continue;
        if (out.length === 0 || LIST_LINE.test(line)) {
          out.push(line);
          continue;
        }
        out[out.length - 1] = `${out[out.length - 1]} ${line}`;
      }
      return out.join('\n');
    })
    .join('\n\n');
}

/** インライン強調 `**…**` を外す。対にならない `**` は残さない。 */
export function unwrapEmphasis(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1');
}
