import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import rehypeSlug from 'rehype-slug';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';

import { Card } from '@/components/ui/card';
import { useActiveHeading } from '@/hooks/use-active-heading';
import { cn } from '@/lib/utils';

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
}

const SIDEBAR_WIDTH = 280;

const SkillSheetViewer = ({ skillSheet }: SkillSheetViewerProps) => {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [mounted, setMounted] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<{ src: string }[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 見出しIDのリストを作成
  const headingIds = headings.map((h) => h.id);
  const activeId = useActiveHeading(headingIds);

  useEffect(() => {
    // Markdownから見出しを抽出
    const extractHeadings = () => {
      const headingRegex = /^(#{1,6})\s+(.+)$/gm;
      const matches = [...skillSheet.content.matchAll(headingRegex)];

      const extractedHeadings: Heading[] = matches.map((match) => {
        const level = match[1].length;
        const text = match[2];
        const id = text
          .toLowerCase()
          .replace(/[^\s\w-]/g, '')
          .replace(/\s+/g, '-');

        return { id, text, level };
      });

      setHeadings(extractedHeadings);
      setMounted(true);
    };

    extractHeadings();
  }, [skillSheet.content]);

  const scrollToHeading = (id: string) => {
    const element = document.querySelector(`#${id}`);
    if (element) {
      const yOffset = -80; // ヘッダー分のオフセット
      const y = element.getBoundingClientRect().top + window.scrollY + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const handleImageClick = (src: string) => {
    // ドキュメント内のすべての画像を収集
    const images = Array.from(document.querySelectorAll('.markdown-content img')).map((img) => ({
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
      {/* 目次（左サイドバー） */}
      {mounted && <TableOfContents headings={headings} activeId={activeId} onHeadingClick={scrollToHeading} />}

      {/* メインコンテンツ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className={cn(
          'flex-1 py-8 px-4 max-w-3xl mx-auto transition-all duration-300',
          mounted && !isMobile && `ml-[${SIDEBAR_WIDTH}px]`,
        )}
        style={{ marginLeft: mounted && !isMobile ? SIDEBAR_WIDTH : 0 }}
      >
        <Card className="p-4 sm:p-6 md:p-8 rounded-xl shadow-md">
          <h1 className="text-3xl font-bold mb-6">{skillSheet.title}</h1>

          <div
            className={cn(
              'markdown-content prose prose-slate dark:prose-invert max-w-none',
              // Headings
              '[&_h1,&_h2,&_h3,&_h4,&_h5,&_h6]:mt-6 [&_h1,&_h2,&_h3,&_h4,&_h5,&_h6]:mb-4 [&_h1,&_h2,&_h3,&_h4,&_h5,&_h6]:font-semibold [&_h1,&_h2,&_h3,&_h4,&_h5,&_h6]:scroll-mt-24',
              '[&_h1]:text-3xl [&_h1]:border-b-2 [&_h1]:border-primary [&_h1]:pb-2 [&_h1]:text-primary',
              '[&_h2]:text-2xl [&_h2]:border-b [&_h2]:border-border [&_h2]:pb-2',
              '[&_h3]:text-xl',
              // Paragraphs
              '[&_p]:mb-4 [&_p]:leading-relaxed [&_p]:text-foreground',
              // Code
              '[&_code]:bg-slate-100 [&_code]:dark:bg-slate-700 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[0.9em] [&_code]:font-mono',
              '[&_code]:text-slate-700 [&_code]:dark:text-slate-200',
              '[&_pre]:mb-6',
              '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
              // Tables
              '[&_table]:w-full [&_table]:border-collapse [&_table]:mb-4 [&_table]:block [&_table]:overflow-auto',
              '[&_th,&_td]:border [&_th,&_td]:border-border [&_th,&_td]:px-4 [&_th,&_td]:py-3 [&_th,&_td]:text-left',
              '[&_th]:bg-muted [&_th]:font-semibold [&_th]:text-foreground',
              '[&_td]:text-foreground',
              // Lists
              '[&_ul,&_ol]:mb-4 [&_ul,&_ol]:pl-8',
              '[&_li]:mb-1 [&_li]:leading-relaxed [&_li]:text-foreground',
              '[&_li]:marker:text-primary',
              // Blockquote
              '[&_blockquote]:border-l-4 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:ml-0 [&_blockquote]:my-6',
              '[&_blockquote]:italic [&_blockquote]:text-muted-foreground',
              '[&_blockquote]:bg-muted/50 [&_blockquote]:py-4 [&_blockquote]:pr-4 [&_blockquote]:rounded-r-lg',
              // Links
              '[&_a]:text-primary [&_a]:no-underline [&_a]:font-medium',
              '[&_a]:border-b [&_a]:border-transparent [&_a]:transition-all [&_a]:duration-200',
              '[&_a:hover]:border-primary [&_a:hover]:text-primary-dark',
              // Images
              '[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_img]:my-4 [&_img]:cursor-pointer',
              '[&_img]:transition-all [&_img]:duration-200',
              '[&_img:hover]:scale-[1.02] [&_img:hover]:shadow-lg',
              // HR
              '[&_hr]:border-none [&_hr]:border-t [&_hr]:border-border [&_hr]:my-6',
            )}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              rehypePlugins={[rehypeSlug]}
              components={{
                code(props) {
                  const { className, children, ...rest } = props;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
                      onClick={() => src && handleImageClick(src)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && src) {
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
        </Card>
      </motion.div>

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
