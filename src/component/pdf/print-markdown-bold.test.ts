import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';
import { PDF_REMARK_PLUGINS } from '@/lib/markdown-config';
import { isHeadingLikeParagraph, type MdNode } from './print-markdown';

const processor = unified().use(remarkParse).use(PDF_REMARK_PLUGINS);
const paragraphs = (text: string): MdNode[] =>
  ((processor.runSync(processor.parse(text)) as unknown as MdNode).children ?? []).filter(
    (n) => n.type === 'paragraph',
  );

describe('太字の扱い', () => {
  it('段落まるごとが太字なら本文の小見出しとして残す', () => {
    expect(paragraphs('**開発基盤・チーム**').map(isHeadingLikeParagraph)).toEqual([true]);
  });

  it('文の途中の強調は小見出しではない（地の文として描く）', () => {
    // 提出用 PDF では、本人が理由を説明できない強調を紙面に残さない（オーナー指摘）。
    const text = 'API キー方式に変更し、**月額運用コストの削減**と**レスポンスタイムの改善**を実現しました。';
    expect(paragraphs(text).map(isHeadingLikeParagraph)).toEqual([false]);
  });

  it('太字の前後に空白しか無い段落も小見出しとして扱う', () => {
    expect(paragraphs('  **品質・セキュリティ**  ').map(isHeadingLikeParagraph)).toEqual([true]);
  });
});
