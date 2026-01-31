import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check } from 'lucide-react';
import { motion } from 'framer-motion';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useThemeMode } from '@/context/theme-context';

interface CodeBlockProps {
  children: React.ReactNode;
  className?: string;
}

const CodeBlock = ({ children, className }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);
  const { mode } = useThemeMode();

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
    <TooltipProvider>
      <div className="relative rounded-lg overflow-hidden mb-6 border border-border">
        {/* ヘッダー */}
        <div className="flex justify-between items-center px-4 py-2 bg-neutral-100 dark:bg-[#1e1e1e] border-b border-border">
          <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
            {language || 'code'}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-primary"
                onClick={() => void handleCopy()}
                aria-label="コードをコピー"
              >
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </motion.div>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copied ? 'コピーしました！' : 'コードをコピー'}</TooltipContent>
          </Tooltip>
        </div>

        {/* コードブロック */}
        <SyntaxHighlighter
          language={language}
          style={mode === 'dark' ? vscDarkPlus : vs}
          customStyle={{
            margin: 0,
            padding: '16px',
            fontSize: '0.875rem',
            lineHeight: 1.7,
            fontFamily: '"Fira Code", "Consolas", "Monaco", monospace',
            backgroundColor: mode === 'dark' ? '#1e1e1e' : '#ffffff',
          }}
          PreTag="div"
        >
          {String(children).replace(/\n$/, '')}
        </SyntaxHighlighter>
      </div>
    </TooltipProvider>
  );
};

export default CodeBlock;
