'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
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

const SkillSheetViewer = ({ skillSheet, compareMode = false }: SkillSheetViewerProps) => {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [mounted, setMounted] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<{ src: string }[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  // 直近に抽出した見出しのシグネチャ。MutationObserver による再抽出時に
  // 内容が変わっていなければ setState を抑止し、再描画→再抽出の無限ループを防ぐ。
  const lastHeadingSigRef = useRef<string>('');

  // 見出しIDのリストを作成。
  // useActiveHeading には contentRef を渡し、見出し探索をこのビューア配下に scope する
  // （比較モードで2ビューアが同一 ID を持っても互いに干渉しない）。
  const headingIds = headings.map((h) => h.id);
  const activeId = useActiveHeading(headingIds, contentRef);

  // biome-ignore lint/correctness/useExhaustiveDependencies: skillSheet.content はReactMarkdown経由でDOMに反映されるため、DOM再抽出のトリガーとして必要
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    // contentRef 配下のレンダリング済み見出しから決定的に目次データを作る。
    // ReactMarkdown + rehypeSlug は同一コミットで id 付き見出しを描画するため、
    // 固定 setTimeout で描画完了を待つ必要はない（タイミング依存のレースを排除）。
    const extractHeadings = () => {
      const headingElements = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const extractedHeadings: Heading[] = Array.from(headingElements)
        .filter((el) => el.id) // IDがある要素のみ
        .map((el) => ({
          id: el.id,
          text: el.textContent || '',
          level: parseInt(el.tagName.substring(1), 10),
        }));

      // 内容が前回と同一なら setState しない（無限ループ防止）。
      const signature = JSON.stringify(extractedHeadings);
      if (signature === lastHeadingSigRef.current) {
        setMounted(true);
        return;
      }
      lastHeadingSigRef.current = signature;

      setHeadings(extractedHeadings);
      setMounted(true);
    };

    // 初回（effect コミット時点で DOM 反映済み）に同期抽出する。
    extractHeadings();

    // 念のため、配下 DOM の後続変化（遅延描画・画像差し替え等）も拾えるよう監視する。
    // MutationObserver なら固定遅延に頼らず変化のタイミングで再抽出できる。
    const observer = new MutationObserver(extractHeadings);
    observer.observe(container, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [skillSheet.content]);

  const scrollToHeading = (id: string) => {
    // 比較モードでは両ビューアに同一 ID が存在しうるため document 全体ではなく
    // このビューア配下に scope して目的の見出しを引く。
    // ID に CSS 特殊文字が含まれうるため querySelector ではなく配下走査で一致を探す。
    const root = contentRef.current;
    const element = root
      ? (Array.from(root.querySelectorAll<HTMLElement>('[id]')).find((el) => el.id === id) ?? null)
      : document.getElementById(id);
    if (element) {
      const yOffset = -80; // ヘッダー分のオフセット
      const y = element.getBoundingClientRect().top + window.scrollY + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const handleImageClick = (src: string) => {
    // 非 http(s)/相対 のスキームはライトボックスを開かない（XSS防止）。
    if (!isSafeImageSrc(src)) return;
    const images = Array.from((contentRef.current ?? document).querySelectorAll('img'))
      .map((img) => ({ src: (img as HTMLImageElement).src }))
      .filter((img) => isSafeImageSrc(img.src));
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
                  // react-markdown v10 は inline prop を渡さないため、ブロックコードを
                  // language-xxx className か改行の有無で判定する（無ければインライン）。
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
                  // 安全なスキーム（http/https/相対）以外はそもそも描画しない。
                  if (typeof src !== 'string' || !isSafeImageSrc(src)) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => handleImageClick(src)}
                      className="cursor-zoom-in border-0 bg-transparent p-0"
                    >
                      <img src={src} alt={alt} {...props} />
                    </button>
                  );
                },
                // GFM の列 alignment を inline text-align として適用する（sanitize 後の
                // hast node.properties.align から読む）。globals.css の固定 left は撤去済み。
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
