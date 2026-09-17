/**
 * `react-syntax-highlighter` の細かい読み込み口には型定義が無い。
 * 全言語同梱をやめて必要な言語だけ登録するためにこれらの読み込み口が要る
 * （初回ロードから約 700KB を落とすため）。使う分だけ最小限で型を宣言する。
 */
declare module 'react-syntax-highlighter/dist/esm/prism-async-light' {
  import type { ComponentType } from 'react';
  import type { SyntaxHighlighterProps } from 'react-syntax-highlighter';

  /** 言語定義は refractor 由来の関数。中身には触らないので unknown 引数で受ける。 */
  type PrismLanguage = (prism: unknown) => void;

  const SyntaxHighlighter: ComponentType<SyntaxHighlighterProps> & {
    registerLanguage(name: string, definition: PrismLanguage): void;
  };
  export default SyntaxHighlighter;
}

declare module 'react-syntax-highlighter/dist/esm/languages/prism/*' {
  const language: (prism: unknown) => void;
  export default language;
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism/*' {
  const style: Record<string, Record<string, string>>;
  export default style;
}
