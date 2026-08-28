import { Check, Copy } from 'lucide-react';
import { memo, useState } from 'react';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
// `react-syntax-highlighter` の `Prism` は全言語を同梱するため、コード例を1つも含まない
// スキルシートでも常に約 700KB（raw）のチャンクが初回ロードに乗っていた。
// 実際に使う言語だけを登録する async-light 版に切り替え、テーマも 2 つだけ個別に読む。
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-async-light';
import vs from 'react-syntax-highlighter/dist/esm/styles/prism/vs';
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useThemeMode } from '@/context/theme-context';

interface CodeBlockProps {
  children: React.ReactNode;
  className?: string;
}

const COPIED_RESET_MS = 2000;

// スキルシートに載りうる言語だけを登録する。未登録の言語は色が付かないだけで、
// コードそのものは今までどおり表示される（表示が壊れることはない）。
for (const [name, definition] of [
  ['bash', bash],
  ['css', css],
  ['diff', diff],
  ['go', go],
  ['java', java],
  ['javascript', javascript],
  ['json', json],
  ['jsx', jsx],
  ['markdown', markdown],
  ['python', python],
  ['sql', sql],
  ['tsx', tsx],
  ['typescript', typescript],
  ['yaml', yaml],
] as const) {
  SyntaxHighlighter.registerLanguage(name, definition);
}
// よく使う別名も同じ定義に寄せる。
SyntaxHighlighter.registerLanguage('ts', typescript);
SyntaxHighlighter.registerLanguage('js', javascript);
SyntaxHighlighter.registerLanguage('sh', bash);
SyntaxHighlighter.registerLanguage('shell', bash);
SyntaxHighlighter.registerLanguage('yml', yaml);
SyntaxHighlighter.registerLanguage('md', markdown);

const CodeBlock = memo(function CodeBlock({ children, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const { mode } = useThemeMode();
  const isDark = mode === 'dark';

  // 言語を抽出
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';

  const handleCopy = async () => {
    const code = String(children).replace(/\n$/, '');
    try {
      // navigator.clipboard はセキュアコンテキスト（HTTPS / localhost）限定で、
      // 平文 HTTP 配信では undefined になる。権限拒否でも reject する。
      // 捕捉しないと未処理の rejection になり、利用者には「押しても何も起きない」
      // だけが残る（成功時の状態変化にも到達しない）。
      await navigator.clipboard.writeText(code);
    } catch {
      toast.error('コピーできませんでした。手動で選択してコピーしてください。');
      return;
    }
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
});

export default CodeBlock;
