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
  /**
   * false の場合、生成する <a> を tabIndex={-1} にしてキーボードフォーカスの対象から外す。
   * 呼び出し元が roving-tabindex（1つの toolbar 全体で tab 停止点を1つにまとめる）を
   * 実装している場合、内側の <a> がネイティブに tabIndex=0 相当でフォーカス可能なままだと
   * 親の roving-tabindex 設計が崩れる（Tab がリンクの数だけ余計に止まる）ため、
   * その文脈でのみ false を渡す（既定は通常のフォーカス可能なリンクのまま）。
   */
  linksTabbable?: boolean;
}

/**
 * 案件カードの短文フィールド（担当業務・習得スキル・コメント等）向けの軽量 Markdown 描画。
 * skill-sheet-viewer.tsx の MarkdownContent と同じサニタイズ設定（rehype-sanitize +
 * MARKDOWN_SANITIZE_SCHEMA）を共有しつつ、見出しID付与・画像ライトボックスなど
 * ページ本文向けの重い機能は持たない。箇条書き・強調・改行のみを想定した最小構成。
 */
export function InlineMarkdown({ content, className, linksTabbable = true }: InlineMarkdownProps) {
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
          // 案件カードの短文フィールド（summary/duties/acquired/comment）はこれまで素の
          // テキストとして扱われており、画像を埋め込む想定は無い。img 用の component
          // オーバーライドが無いと ReactMarkdown は既定の <img> 描画にフォールバックし、
          // sanitize schema が画像を許可しているため、外部トラッキング画像等が読み込まれて
          // しまう（レビュー指摘）。ここでは画像を明示的に描画せず alt テキストのみ残す。
          img: ({ alt }) => (alt ? alt : null),
          // Tailwind preflight がリンクの色・下線をリセットするため明示的に指定しないと、
          // 周囲の地の文と見分けが付かず発見性が無くなる（レビュー指摘）。
          // react-markdown 10 はカスタムコンポーネントへ HAST の `node` を渡す。
          // そのまま spread すると DOM 属性として <a> に載り、React の警告になる。
          a: ({ children, node: _node, ...props }) => (
            <a
              {...props}
              tabIndex={linksTabbable ? undefined : -1}
              // text-primary は背景に対しライトテーマで3.74と WCAG AA 未達（Issue #198:
              // 「案件内のURLリンク」）。hover の /80（80%不透明度）はカード背景へブレンドし、
              // ライト4.35:1・ダーク3.59:1 まで下がり AA を割り込んでいた（Codex レビュー指摘）。
              // 不透明な --primary-hover に差し替える（button.tsx と同じトークン）。
              className="text-primary-dark underline underline-offset-2 hover:text-primary-hover"
            >
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
