'use client';

import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

import { MARKDOWN_REMARK_PLUGINS, MARKDOWN_SANITIZE_SCHEMA } from '@/lib/markdown-config';

const REHYPE_PLUGINS = [
  rehypeRaw,
  [rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA] as [typeof rehypeSanitize, typeof MARKDOWN_SANITIZE_SCHEMA],
];

interface InlineMarkdownProps {
  content: string;
  className?: string;
}

/**
 * 案件カードの短文フィールド（担当業務・習得スキル・コメント等）向けの軽量 Markdown 描画。
 * skill-sheet-viewer.tsx の MarkdownContent と同じサニタイズ設定（rehype-sanitize +
 * MARKDOWN_SANITIZE_SCHEMA）を共有しつつ、見出しID付与・画像ライトボックスなど
 * ページ本文向けの重い機能は持たない。箇条書き・強調・改行のみを想定した最小構成。
 */
export function InlineMarkdown({ content, className }: InlineMarkdownProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={MARKDOWN_REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          // Tailwind preflight がリンクの色・下線をリセットするため明示的に指定しないと、
          // 周囲の地の文と見分けが付かず発見性が無くなる（レビュー指摘）。
          a: ({ children, ...props }) => (
            <a {...props} className="text-primary underline underline-offset-2 hover:text-primary/80">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default InlineMarkdown;
