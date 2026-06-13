import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs, vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useThemeMode } from '@/context/theme-context';

interface CodeBlockProps {
  children: React.ReactNode;
  className?: string;
}

const COPIED_RESET_MS = 2000;

const CodeBlock = ({ children, className }: CodeBlockProps) => {
  const [copied, setCopied] = useState(false);
  const { mode } = useThemeMode();
  const isDark = mode === 'dark';

  // 言語を抽出
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';

  const handleCopy = async () => {
    const code = String(children).replace(/\n$/, '');
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_RESET_MS);
  };

  return (
    <div className="mb-6 overflow-hidden rounded-lg border border-border">
      {/* ヘッダー */}
      <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {language || 'code'}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-primary"
              onClick={() => void handleCopy()}
              aria-label="コードをコピー"
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{copied ? 'コピーしました！' : 'コードをコピー'}</TooltipContent>
        </Tooltip>
      </div>

      {/* コードブロック */}
      <SyntaxHighlighter
        language={language}
        style={isDark ? vscDarkPlus : vs}
        customStyle={{
          margin: 0,
          padding: '16px',
          fontSize: '0.875rem',
          lineHeight: 1.7,
          fontFamily: '"Fira Code", "Consolas", "Monaco", monospace',
          backgroundColor: isDark ? '#1e1e1e' : '#ffffff',
        }}
        PreTag="div"
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    </div>
  );
};

export default CodeBlock;
