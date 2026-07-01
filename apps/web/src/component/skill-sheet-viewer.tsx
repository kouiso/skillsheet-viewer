'use client';

import { motion } from 'framer-motion';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';

import type { Block } from '@skillsheet/db/blocks';
import { experienceBlockToMarkdown, tableBlockToMarkdown } from '@skillsheet/db/blocks';
import { useActiveHeading } from '@/hooks/use-active-heading';
import { ProfileIntro } from './blocks/ProfileIntro';
import { ProjectCard } from './blocks/ProjectCard';
import { SkillMatrix } from './blocks/SkillMatrix';
import { StatRow } from './blocks/StatRow';
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
  blocks?: Block[];
  compareMode?: boolean;
}

// img src として許可するURLスキーム。http/https/相対パスのみ通し、
// javascript: や data: 等は除外して XSS を防ぐ。
const IMG_SRC_PROTOCOLS = ['http', 'https'] as const;

// src が http(s) または相対パスかを判定する（javascript:/data: 等を拒否）。
const isSafeImageSrc = (src: string): boolean => {
  // 相対パス（スキームを持たない）は許可する。
  if (!/^[a-z][a-z0-9+.-]*:/i.test(src)) return true;
  return IMG_SRC_PROTOCOLS.some((p) => src.toLowerCase().startsWith(`${p}:`));
};

// GFM の列 alignment（remark-rehype が th/td の properties.align に left/center/right で
// 載せる。rehype-sanitize の defaultSchema は align を保持する）を inline text-align へ。
// 未指定列は left（GitHub 既定・従来挙動）。CSS の固定 text-align は撤去済みのため、
// この inline スタイルが桁揃えの唯一の決定要因になる。
const cellTextAlign = (align: unknown): 'left' | 'center' | 'right' =>
  align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';

// rehype-raw が有効化する生HTML描画を details/summary タグに限定する。
// style属性はデフォルトスキーマで除外済み（XSS防止）。
// img の src は http/https/相対パスのみ許可し、javascript:/data: 等を除外する。
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary'],
  attributes: {
    ...defaultSchema.attributes,
    details: ['open'],
  },
  protocols: {
    ...defaultSchema.protocols,
    src: [...IMG_SRC_PROTOCOLS],
  },
};

// remark/rehype プラグイン配列はモジュールスコープで固定し、毎レンダーの新規生成を防ぐ。
const REMARK_PLUGINS = [remarkGfm, remarkBreaks];
const REHYPE_PLUGINS = [
  rehypeRaw,
  [rehypeSanitize, SANITIZE_SCHEMA] as [typeof rehypeSanitize, typeof SANITIZE_SCHEMA],
  rehypeSlug,
];

interface MarkdownContentProps {
  content: string;
  onImageClick: (src: string) => void;
}

// Markdown本文はactiveIdに依存しないためメモ化してスクロール再描画を防ぐ。
const MarkdownContent = memo(function MarkdownContent({ content, onImageClick }: MarkdownContentProps) {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={{
          code(props) {
            const { className, children, ...rest } = props;
            const isBlock = /language-/.test(className ?? '') || /\n/.test(String(children));
            if (!isBlock) {
              return (
                <code className={className} {...rest}>
                  {children}
                </code>
              );
            }
            return <CodeBlock className={className}>{children}</CodeBlock>;
          },
          img({ src, alt, ...props }) {
            if (typeof src !== 'string' || !isSafeImageSrc(src)) return null;
            return (
              <button
                type="button"
                onClick={() => onImageClick(src)}
                className="cursor-zoom-in border-0 bg-transparent p-0"
              >
                {/* biome-ignore lint/performance/noImgElement: ライトボックス内の任意画像は next/image と相性が悪い */}
                <img src={src} alt={alt} {...props} />
              </button>
            );
          },
          th({ node, children, style, ...props }) {
            return (
              <th {...props} style={{ ...style, textAlign: cellTextAlign(node?.properties?.align) }}>
                {children}
              </th>
            );
          },
          td({ node, children, style, ...props }) {
            return (
              <td {...props} style={{ ...style, textAlign: cellTextAlign(node?.properties?.align) }}>
                {children}
              </td>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

// markdown/table/experience → markdown文字列, skills/profile/stats/project → null（React コンポーネントで描画）
function blockToMarkdownContent(block: Block): string | null {
  if (block.type === 'markdown') return block.data.markdown;
  if (block.type === 'table') return tableBlockToMarkdown(block.data);
  if (block.type === 'experience') return experienceBlockToMarkdown(block.data);
  return null;
}

type RenderGroup = { kind: 'skills'; blocks: Extract<Block, { type: 'skills' }>[] } | { kind: 'single'; block: Block };

// 連続する skills ブロックを1つの描画グループにまとめる。
// A4: 6個の独立したマトリクスではなく、1つの SkillMatrix コンテナ内にカテゴリを並べて表示する。
function groupBlocks(blocks: Block[]): RenderGroup[] {
  const groups: RenderGroup[] = [];
  for (const block of blocks) {
    // SkillMatrix は空の skills ブロックを null 描画するため、グループにも含めない
    // （含めると中身が空の枠線コンテナだけが描画されてしまう）。
    if (block.type === 'skills' && block.data.skills.length === 0) continue;
    const lastGroup = groups.at(-1);
    if (block.type === 'skills') {
      if (lastGroup?.kind === 'skills') {
        lastGroup.blocks.push(block);
      } else {
        groups.push({ kind: 'skills', blocks: [block] });
      }
    } else {
      groups.push({ kind: 'single', block });
    }
  }
  return groups;
}

const SkillSheetViewer = ({ skillSheet, blocks, compareMode = false }: SkillSheetViewerProps) => {
  // headings/lightbox の更新で再レンダリングされても blocks が変わらなければ再計算しない。
  const groupedBlocks = useMemo(() => (blocks ? groupBlocks(blocks) : []), [blocks]);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [mounted, setMounted] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<{ src: string }[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  // 直近に抽出した見出しのシグネチャ。MutationObserver による再抽出時に
  // 内容が変わっていなければ setState を抑止し、再描画→再抽出の無限ループを防ぐ。
  const lastHeadingSigRef = useRef<string>('');

  // headingIds を useMemo で安定化。IntersectionObserver の再作成を最小限に抑える。
  const headingIds = useMemo(() => headings.map((h) => h.id), [headings]);
  const activeId = useActiveHeading(headingIds, contentRef);

  // blocks モード時は blocks の id+order を、レガシーモードは content をキーにして
  // 見出し再抽出をトリガーする。
  const contentKey = blocks ? blocks.map((b) => `${b.id}:${b.order}`).join(',') : skillSheet.content;

  // biome-ignore lint/correctness/useExhaustiveDependencies: contentKey はDOM再抽出のトリガーとして必要
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const extractHeadings = () => {
      const headingElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const extractedHeadings: Heading[] = Array.from(headingElements)
        .filter((el) => el.id)
        .map((el) => ({
          id: el.id,
          text: el.textContent || '',
          level: parseInt(el.tagName.substring(1), 10),
        }));

      const signature = JSON.stringify(extractedHeadings);
      if (signature === lastHeadingSigRef.current) {
        setMounted(true);
        return;
      }
      lastHeadingSigRef.current = signature;

      setHeadings(extractedHeadings);
      setMounted(true);
    };

    extractHeadings();

    const observer = new MutationObserver(extractHeadings);
    observer.observe(container, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [contentKey]);

  const scrollToHeading = (id: string) => {
    const root = contentRef.current;
    const element = root
      ? (Array.from(root.querySelectorAll<HTMLElement>('[id]')).find((el) => el.id === id) ?? null)
      : document.getElementById(id);
    if (element) {
      const yOffset = -80;
      const y = element.getBoundingClientRect().top + window.scrollY + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const handleImageClick = useCallback((src: string) => {
    if (!isSafeImageSrc(src)) return;
    const images = Array.from((contentRef.current ?? document).querySelectorAll('img'))
      .map((img) => ({ src: (img as HTMLImageElement).src }))
      .filter((img) => isSafeImageSrc(img.src));
    setLightboxImages(images);

    const index = images.findIndex((img) => img.src === src);
    setCurrentImageIndex(index);
    setLightboxOpen(true);
  }, []);

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
        <div ref={contentRef} className="rounded border border-border bg-card p-4 sm:p-6 md:p-8">
          {blocks ? (
            <div className="space-y-0">
              {groupedBlocks.map((group) => {
                if (group.kind === 'skills') {
                  const key = group.blocks.map((b) => b.id).join('-');
                  return (
                    <div
                      key={key}
                      className="mb-6 grid grid-cols-1 gap-4 rounded border border-border p-4 sm:p-5 md:grid-cols-2 lg:grid-cols-3"
                    >
                      {group.blocks.map((block) => (
                        <SkillMatrix
                          key={block.id}
                          data={block.data}
                          className="mb-0 rounded-md border border-border/60 p-3"
                        />
                      ))}
                    </div>
                  );
                }
                const block = group.block;
                const mdContent = blockToMarkdownContent(block);
                if (mdContent !== null) {
                  return <MarkdownContent key={block.id} content={mdContent} onImageClick={handleImageClick} />;
                }
                if (block.type === 'profile') {
                  return <ProfileIntro key={block.id} data={block.data} />;
                }
                if (block.type === 'stats') {
                  return <StatRow key={block.id} data={block.data} />;
                }
                if (block.type === 'project') {
                  return <ProjectCard key={block.id} data={block.data} />;
                }
                return null;
              })}
            </div>
          ) : (
            <>
              <h1 className="mb-4 text-3xl font-bold sm:text-4xl">{skillSheet.title}</h1>
              <MarkdownContent content={skillSheet.content} onImageClick={handleImageClick} />
            </>
          )}
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
