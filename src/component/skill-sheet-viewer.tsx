import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

import { Box, Container, Typography, Paper, useTheme, useMediaQuery } from '@mui/material';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';
import { motion } from 'framer-motion';

import TableOfContents from './table-of-contents';
import CodeBlock from './code-block';
import { useActiveHeading } from '@/hooks/use-active-heading';

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

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

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
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* 目次（左サイドバー） */}
      {mounted && (
        <TableOfContents headings={headings} activeId={activeId} onHeadingClick={scrollToHeading} />
      )}

      {/* メインコンテンツ */}
      <Container
        maxWidth="md"
        component={motion.div}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        sx={{
          ml: mounted && !isMobile ? `${SIDEBAR_WIDTH}px` : 0,
          py: 4,
          flex: 1,
          transition: 'margin-left 0.3s ease',
        }}
      >
        <Paper
          elevation={2}
          sx={{
            p: { xs: 2, sm: 3, md: 4 },
            backgroundColor: theme.palette.background.paper,
            borderRadius: 3,
          }}
        >
          <Typography variant="h3" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
            {skillSheet.title}
          </Typography>

          <Box
            className="markdown-content"
            sx={{
              '& h1, & h2, & h3, & h4, & h5, & h6': {
                mt: 3,
                mb: 2,
                fontWeight: 600,
                scrollMarginTop: '100px',
              },
              '& h1': {
                fontSize: '2rem',
                borderBottom: `2px solid ${theme.palette.primary.main}`,
                pb: 1,
                color: theme.palette.primary.main,
              },
              '& h2': {
                fontSize: '1.5rem',
                borderBottom: `1px solid ${theme.palette.divider}`,
                pb: 1,
              },
              '& h3': { fontSize: '1.25rem' },
              '& p': {
                mb: 2,
                lineHeight: 1.8,
                color: theme.palette.text.primary,
              },
              '& code': {
                backgroundColor: theme.palette.mode === 'dark' ? '#334155' : '#f1f5f9',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '0.9em',
                fontFamily: '"Fira Code", "Consolas", "Monaco", monospace',
                color: theme.palette.mode === 'dark' ? '#e2e8f0' : '#334155',
              },
              '& pre': {
                mb: 3,
              },
              '& pre code': {
                backgroundColor: 'transparent',
                padding: 0,
              },
              '& table': {
                width: '100%',
                borderCollapse: 'collapse',
                mb: 2,
                overflow: 'auto',
                display: 'block',
              },
              '& th, & td': {
                border: `1px solid ${theme.palette.divider}`,
                padding: '12px 16px',
                textAlign: 'left',
              },
              '& th': {
                backgroundColor: theme.palette.mode === 'dark' ? '#1e293b' : '#f8fafc',
                fontWeight: 600,
                color: theme.palette.text.primary,
              },
              '& td': {
                color: theme.palette.text.primary,
              },
              '& ul, & ol': {
                mb: 2,
                pl: 3,
              },
              '& li': {
                mb: 0.5,
                lineHeight: 1.8,
                color: theme.palette.text.primary,
              },
              '& blockquote': {
                borderLeft: `4px solid ${theme.palette.primary.main}`,
                pl: 2,
                ml: 0,
                my: 2,
                fontStyle: 'italic',
                color: theme.palette.text.secondary,
                backgroundColor: theme.palette.mode === 'dark' ? '#1e293b' : '#f8fafc',
                py: 1,
                borderRadius: '0 4px 4px 0',
              },
              '& a': {
                color: theme.palette.primary.main,
                textDecoration: 'none',
                fontWeight: 500,
                transition: 'all 0.2s ease',
                '&:hover': {
                  textDecoration: 'underline',
                  color: theme.palette.primary.dark,
                },
              },
              '& img': {
                maxWidth: '100%',
                height: 'auto',
                borderRadius: 2,
                my: 2,
                cursor: 'pointer',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                '&:hover': {
                  transform: 'scale(1.02)',
                  boxShadow: theme.shadows[4],
                },
              },
              '& hr': {
                border: 'none',
                borderTop: `1px solid ${theme.palette.divider}`,
                my: 3,
              },
            }}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
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
          </Box>
        </Paper>
      </Container>

      {/* Lightbox */}
      <Lightbox
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        slides={lightboxImages}
        index={currentImageIndex}
      />
    </Box>
  );
};

export default SkillSheetViewer;
