'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';

import type { Block } from '@skillsheet/db/blocks';
import { experienceBlockToMarkdown, isBlockInputEmpty, tableBlockToMarkdown } from '@skillsheet/db/blocks';
import { useActiveHeading } from '@/hooks/use-active-heading';
import { isSafeImageSrc, MARKDOWN_REMARK_PLUGINS, MARKDOWN_SANITIZE_SCHEMA } from '@/lib/markdown-config';
import { ProfileIntro } from './blocks/profile-intro';
import { ProjectSection } from './blocks/project-section';
import { SectionHead } from './blocks/section-head';
import { SkillMatrix } from './blocks/skill-matrix';
import { StatRow } from './blocks/stat-row';
import CodeBlock from './code-block';
import TableOfContents from './table-of-contents';
import type { ViewKey } from './viewer-topbar';

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
  /**
   * 表示するビューの集合。省略時は全ビューON
   * （ビルダープレビュー・比較ページは従来どおり全セクション表示）。
   */
  views?: ViewKey[];
}

// GFM の列 alignment（remark-rehype が th/td の properties.align に left/center/right で
// 載せる。rehype-sanitize の defaultSchema は align を保持する）を inline text-align へ。
// 未指定列は left（GitHub 既定・従来挙動）。CSS の固定 text-align は撤去済みのため、
// この inline スタイルが桁揃えの唯一の決定要因になる。
const cellTextAlign = (align: unknown): 'left' | 'center' | 'right' =>
  align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';

// hast のノードを最小限の形で扱う（rehype プラグインの型は unified 側で any 相当のため）。
interface HastLikeNode {
  type?: string;
  tagName?: string;
  properties?: { id?: string; [key: string]: unknown };
  children?: HastLikeNode[];
}

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

// 各 markdown ブロックは独立した <ReactMarkdown> インスタンス（＝独立した rehype-slug の
// GithubSlugger）で処理されるため、同じ見出しテキストが複数ブロックに現れると同一 id が
// 重複してしまう（TableOfContents の key 重複・アンカー衝突の原因）。rehype-slug の直後に
// 差し込み、id をブロック単位で常に一意にする。
function rehypePrefixHeadingIds(prefix: string) {
  return (tree: HastLikeNode) => {
    const walk = (node: HastLikeNode) => {
      if (node.type === 'element' && node.tagName && HEADING_TAGS.has(node.tagName) && node.properties?.id) {
        node.properties.id = `${prefix}-${node.properties.id}`;
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}

interface MarkdownContentProps {
  content: string;
  /** 見出し id をブロック単位で一意化するためのプレフィックス（block.id 等）。 */
  blockId: string;
  onImageClick: (src: string) => void;
}

// Markdown本文はactiveIdに依存しないためメモ化してスクロール再描画を防ぐ。
const MarkdownContent = memo(function MarkdownContent({ content, blockId, onImageClick }: MarkdownContentProps) {
  const rehypePlugins = useMemo(
    () => [
      rehypeRaw,
      [rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA] as [typeof rehypeSanitize, typeof MARKDOWN_SANITIZE_SCHEMA],
      rehypeSlug,
      [rehypePrefixHeadingIds, blockId] as [typeof rehypePrefixHeadingIds, string],
    ],
    [blockId],
  );

  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={MARKDOWN_REMARK_PLUGINS}
        rehypePlugins={rehypePlugins}
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
          table({ children }) {
            return (
              <div className="overflow-x-auto">
                <table className="min-w-[480px] w-full border-collapse">{children}</table>
              </div>
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

// ビュートグルでセクションが再マウントされた際のフェードアップ表示
// （デザインプロトタイプの .fadeup 相当）。prefers-reduced-motion 時は即時表示する。
function FadeUpSection({ children }: { children: ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.section>
  );
}

// 連続する skills ブロックを1つの描画グループにまとめる。
// A4: 6個の独立したマトリクスではなく、1つの SkillMatrix コンテナ内にカテゴリを並べて表示する。
function groupBlocks(blocks: Block[]): RenderGroup[] {
  const groups: RenderGroup[] = [];
  for (const block of blocks) {
    // 中身が空のブロックは描画しない（issue #128: テンプレの空 profile/experience/table が
    // 迷子の見出しや空枠線だけの箱として出るのを防ぐ）。ブロック自体は DB に残る —
    // 空判定はあくまで描画時のスキップであり、保存を妨げるものではない。
    if (isBlockInputEmpty(block)) continue;
    // SkillMatrix は category ありでも skills が 0 件なら null 描画するため、グループにも
    // 含めない（isBlockInputEmpty は category 空 かつ skills 0 件の場合のみ空とみなすので、
    // この判定は別途必要）。含めると中身が空の枠線コンテナだけが描画されてしまう。
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

const SkillSheetViewer = ({ skillSheet, blocks, compareMode = false, views }: SkillSheetViewerProps) => {
  // views 未指定（ビルダープレビュー・比較・レガシー）は全ビューON扱い。
  const showView = useCallback((view: ViewKey) => !views || views.includes(view), [views]);
  // headings/lightbox の更新で再レンダリングされても blocks が変わらなければ再計算しない。
  const groupedBlocks = useMemo(() => (blocks ? groupBlocks(blocks) : []), [blocks]);
  // project ブロックを含むシートは「外枠カード無し・セクションが縦に並ぶダッシュボード」レイアウトにする。
  // markdown/table/skills のみの既存シートは従来の単一カード＋max-w-4xlを維持する。
  // 意図的に raw blocks（中身が空でも）で判定する — ダッシュボードテンプレはレイアウトの
  // 意図そのものが project ブロックの有無なので、中身の空判定（isBlockInputEmpty）を
  // 通さない。sheet-view-client.tsx の同名ロジックと必ず揃えること（片方だけ直すと
  // ヘッダー/レイアウトがページ間で食い違う）。
  const isDashboard = useMemo(() => (blocks ?? []).some((b) => b.type === 'project'), [blocks]);
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
      {/* 目次（左サイドバー）— 比較モード、または構造化ダッシュボードで見出しが無い場合は非表示 */}
      {mounted && !compareMode && (!blocks || headings.length > 0) && (
        <TableOfContents headings={headings} activeId={activeId} onHeadingClick={scrollToHeading} />
      )}

      {/* メインコンテンツ */}
      <motion.main
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        // design: max-width 1180px / padding 44px 32px 96px / セクション間 48px
        // min-w-0: flex item 子（StatRow 等）の min-w による幅拡張を抑え、横スクロールを子側に閉じ込める。
        className={`mx-auto min-w-0 w-full flex-1 px-4 pt-8 pb-16 sm:px-8 sm:pt-11 sm:pb-24 ${
          isDashboard ? 'max-w-[1180px]' : 'max-w-4xl'
        }`}
      >
        <div
          ref={contentRef}
          className={
            isDashboard
              ? 'min-w-0 space-y-8 sm:space-y-12'
              : 'min-w-0 overflow-hidden rounded border border-border bg-card p-4 sm:p-6 md:p-8'
          }
        >
          {blocks ? (
            <div className={isDashboard ? 'space-y-8 sm:space-y-12' : 'space-y-0'}>
              {groupedBlocks.map((group) => {
                if (group.kind === 'skills') {
                  if (!showView('skills')) return null;
                  const key = group.blocks.map((b) => b.id).join('-');
                  return (
                    <FadeUpSection key={key}>
                      <SectionHead kicker="Skill Matrix" title="スキルマトリクス" />
                      {/* design: gap 28px(縦) 40px(横) の auto-fit グリッド */}
                      <div className="grid gap-x-10 gap-y-7 rounded-[var(--radius-lg)] border border-border bg-card p-4 sm:p-5 [grid-template-columns:repeat(auto-fit,minmax(min(240px,100%),1fr))]">
                        {group.blocks.map((block) => (
                          <SkillMatrix key={block.id} data={block.data} className="mb-0" />
                        ))}
                      </div>
                    </FadeUpSection>
                  );
                }
                const block = group.block;
                const mdContent = blockToMarkdownContent(block);
                if (mdContent !== null) {
                  return (
                    <MarkdownContent
                      key={block.id}
                      blockId={block.id}
                      content={mdContent}
                      onImageClick={handleImageClick}
                    />
                  );
                }
                if (block.type === 'profile') {
                  return <ProfileIntro key={block.id} data={block.data} />;
                }
                if (block.type === 'stats') {
                  return <StatRow key={block.id} data={block.data} />;
                }
                if (block.type === 'project') {
                  return (
                    <ProjectSection
                      key={block.id}
                      data={block.data}
                      showProcess={showView('process')}
                      showProjects={showView('projects')}
                      showTimeline={showView('timeline')}
                    />
                  );
                }
                return null;
              })}
            </div>
          ) : (
            <>
              <h1 className="mb-4 text-3xl font-bold sm:text-4xl">{skillSheet.title}</h1>
              <MarkdownContent blockId="legacy" content={skillSheet.content} onImageClick={handleImageClick} />
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
