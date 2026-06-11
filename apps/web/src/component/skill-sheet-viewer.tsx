'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

import { motion } from 'framer-motion';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';

import { useActiveHeading } from '@/hooks/use-active-heading';

import CodeBlock from './code-block';
import TableOfContents from './table-of-contents';

interface Heading {
  id: string;
  text: string;
  level: number;
}

interface SkillSheetViewerProps {
  skillSheet: {
    title: string;
    content: string;
  };
  compareMode?: boolean;
}

const HEADING_EXTRACT_DELAY_MS = 100;

// rehype-raw が有効化する生HTML描画を details/summary タグに限定する。
// style属性はデフォルトスキーマで除外済み（XSS防止）。
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary'],
  attributes: {
    ...defaultSchema.attributes,
    details: ['open'],
  },
};

const SkillSheetViewer = ({ skillSheet, compareMode = false }: SkillSheetViewerProps) => {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [mounted, setMounted] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<{ src: string }[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // 見出しIDのリストを作成
  const headingIds = headings.map((h) => h.id);
  const activeId = useActiveHeading(headingIds);

  useEffect(() => {
    // レンダリング後にDOMから見出しを抽出
    const extractHeadingsFromDOM = () => {
      // DOMが完全にレンダリングされるまで少し待つ
      setTimeout(() => {
        const markdownContent = contentRef.current;
        if (!markdownContent) return;

        const headingElements = markdownContent.querySelectorAll('h1, h2, h3, h4, h5, h6');
        const extractedHeadings: Heading[] = Array.from(headingElements)
          .filter((el) => el.id) // IDがある要素のみ
          .map((el) => {
            const level = parseInt(el.tagName.substring(1), 10);
            const text = el.textContent || '';
            const id = el.id;

            return { id, text, level };
          });

        setHeadings(extractedHeadings);
        setMounted(true);
      }, HEADING_EXTRACT_DELAY_MS); // ReactMarkdownのレンダリング完了を待つ
    };

    // 初回とcontent変更時にDOMから見出しを抽出
    extractHeadingsFromDOM();
  }, [skillSheet.content]);

  const scrollToHeading = (id: string) => {
    // IDにCSS特殊文字が含まれる可能性があるため、querySelector ではなく getElementById を使用
    const element = document.getElementById(id);
    if (element) {
      const yOffset = -80; // ヘッダー分のオフセット
      const y = element.getBoundingClientRect().top + window.scrollY + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const handleImageClick = (src: string) => {
    const images = Array.from((contentRef.current ?? document).querySelectorAll('img')).map((img) => ({
      src: (img as HTMLImageElement).src,
    }));
    setLightboxImages(images);

    // クリックされた画像のインデックスを見つける
    const index = images.findIndex((img) => img.src === src);
    setCurrentImageIndex(index);
    setLightboxOpen(true);
  };

  return (
    <div className="flex min-h-screen">
      {/* 目次（左サイドバー）— 比較モードでは非表示 */}
      {mounted && !compareMode && (
        <TableOfContents headings={headings} activeId={activeId} onHeadingClick={scrollToHeading} />
      )}

      {/* メインコンテンツ */}
      <motion.main
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6"
      >
        <div className="rounded-2xl border border-border bg-card p-4 shadow-elevation-2 sm:p-6 md:p-8">
          <h1 className="mb-4 text-3xl font-bold sm:text-4xl">{skillSheet.title}</h1>

          <div className="markdown-content" ref={contentRef}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              rehypePlugins={[rehypeRaw, [rehypeSanitize, SANITIZE_SCHEMA], rehypeSlug]}
              components={{
                code(props) {
                  const { className, children, ...rest } = props;
                  const inline = (props as any).inline;
                  if (inline) {
                    return (
                      <code className={className} {...rest}>
                        {children}
                      </code>
                    );
                  }
                  return <CodeBlock className={className}>{children}</CodeBlock>;
                },
                img({ src, alt, ...props }) {
                  return (
                    <img
                      src={src}
                      alt={alt}
                      {...props}
                      onClick={() => typeof src === 'string' && handleImageClick(src)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && typeof src === 'string') {
                          handleImageClick(src);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    />
                  );
                },
              }}
            >
              {skillSheet.content}
            </ReactMarkdown>
          </div>
        </div>
      </motion.main>

      {/* Lightbox */}
      <Lightbox
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        slides={lightboxImages}
        index={currentImageIndex}
      />
    </div>
  );
};

export default SkillSheetViewer;
