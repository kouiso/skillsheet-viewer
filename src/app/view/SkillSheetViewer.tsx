'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

import { Box, Container, Typography, Paper, List, ListItem, ListItemButton } from '@mui/material';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';

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

export default function SkillSheetViewer({ skillSheet }: SkillSheetViewerProps) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

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
    };

    extractHeadings();
  }, [skillSheet.content]);

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      {/* 目次（左サイドバー） */}
      {mounted && (
        <Paper
          sx={{
            width: 280,
            position: 'fixed',
            height: '100vh',
            overflowY: 'auto',
            p: 2,
            borderRadius: 0,
          }}
        >
          <Typography variant="h6" gutterBottom>
            目次
          </Typography>
          <List dense>
            {headings.map((heading, index) => (
              <ListItem key={index} disablePadding sx={{ pl: (heading.level - 1) * 2 }}>
                <ListItemButton onClick={() => scrollToHeading(heading.id)}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: heading.level === 1 ? '0.95rem' : '0.875rem',
                      fontWeight: heading.level === 1 ? 600 : 400,
                    }}
                  >
                    {heading.text}
                  </Typography>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

      {/* メインコンテンツ */}
      <Container
        maxWidth="md"
        sx={{
          ml: mounted ? '280px' : 0,
          py: 4,
          flex: 1,
        }}
      >
        <Paper sx={{ p: 4 }}>
          <Typography variant="h3" component="h1" gutterBottom>
            {skillSheet.title}
          </Typography>

          <Box
            className="markdown-content"
            sx={{
              '& h1, & h2, & h3, & h4, & h5, & h6': {
                mt: 3,
                mb: 2,
                fontWeight: 600,
              },
              '& h1': { fontSize: '2rem', borderBottom: '2px solid #e0e0e0', pb: 1 },
              '& h2': { fontSize: '1.5rem', borderBottom: '1px solid #e0e0e0', pb: 1 },
              '& h3': { fontSize: '1.25rem' },
              '& p': { mb: 2, lineHeight: 1.7 },
              '& code': {
                backgroundColor: '#f5f5f5',
                padding: '2px 6px',
                borderRadius: '3px',
                fontSize: '0.9em',
                fontFamily: 'monospace',
              },
              '& pre': {
                backgroundColor: '#f5f5f5',
                padding: '1rem',
                borderRadius: '4px',
                overflowX: 'auto',
                mb: 2,
              },
              '& pre code': {
                backgroundColor: 'transparent',
                padding: 0,
              },
              '& table': {
                width: '100%',
                borderCollapse: 'collapse',
                mb: 2,
              },
              '& th, & td': {
                border: '1px solid #e0e0e0',
                padding: '8px 12px',
                textAlign: 'left',
              },
              '& th': {
                backgroundColor: '#f5f5f5',
                fontWeight: 600,
              },
              '& ul, & ol': {
                mb: 2,
                pl: 3,
              },
              '& li': {
                mb: 0.5,
              },
              '& blockquote': {
                borderLeft: '4px solid #e0e0e0',
                pl: 2,
                ml: 0,
                fontStyle: 'italic',
                color: '#666',
              },
              '& a': {
                color: '#1976d2',
                textDecoration: 'none',
                '&:hover': {
                  textDecoration: 'underline',
                },
              },
            }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
              {skillSheet.content}
            </ReactMarkdown>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
