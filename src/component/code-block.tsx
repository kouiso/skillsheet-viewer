import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { Box, IconButton, Tooltip, useTheme } from '@mui/material';
import { ContentCopy, Check } from '@mui/icons-material';
import { motion } from 'framer-motion';

interface CodeBlockProps {
  children: React.ReactNode;
  className?: string;
}

const CodeBlock = ({ children, className }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);
  const theme = useTheme();

  // 言語を抽出
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';

  const handleCopy = async () => {
    const code = String(children).replace(/\n$/, '');
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 2,
        overflow: 'hidden',
        mb: 3,
        border: `1px solid ${theme.palette.divider}`,
      }}
    >
      {/* ヘッダー */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 2,
          py: 1,
          backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Box
          sx={{
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            color: theme.palette.text.secondary,
            letterSpacing: 0.5,
          }}
        >
          {language || 'code'}
        </Box>
        <Tooltip title={copied ? 'コピーしました！' : 'コードをコピー'}>
          <IconButton
            size="small"
            onClick={() => void handleCopy()}
            component={motion.button}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            aria-label="コードをコピー"
            sx={{
              color: theme.palette.text.secondary,
              '&:hover': {
                color: theme.palette.primary.main,
              },
            }}
          >
            {copied ? <Check fontSize="small" /> : <ContentCopy fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* コードブロック */}
      <SyntaxHighlighter
        language={language}
        style={theme.palette.mode === 'dark' ? vscDarkPlus : vs}
        customStyle={{
          margin: 0,
          padding: '16px',
          fontSize: '0.875rem',
          lineHeight: 1.7,
          fontFamily: '"Fira Code", "Consolas", "Monaco", monospace',
          backgroundColor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#ffffff',
        }}
        PreTag="div"
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    </Box>
  );
};

export default CodeBlock;
