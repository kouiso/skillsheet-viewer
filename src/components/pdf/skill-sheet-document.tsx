import { Document, Page, View } from '@react-pdf/renderer';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import { PDF_REMARK_PLUGINS } from '@/lib/markdown-config';

import type { MdNode } from './mdast';
import { styles, Text } from './pdf-theme';
import { isCardLikelyToFitOnePage, renderBlocks, safe } from './render-nodes';

export type { MdNode } from './mdast';
// 既存の読み込み口を変えない（テストと呼び出し側がここから取っている）。
export { NUM } from './pdf-theme';
export { isCardLikelyToFitOnePage, renderBlocks };

export interface SkillSheetDocumentProps {
  title: string;
  content: string;
}

/**
 * Markdown のスキルシートを、ビューア準拠デザインの本物の PDF として描画する（純粋描画）。
 * フォント登録は呼び出し側で行う前提（ブラウザ: pdf/fonts.ts / Node: 検証スクリプト）。
 */
export const SkillSheetDocument = ({ title, content }: SkillSheetDocumentProps) => {
  // 単独改行は markdown 既定どおり空白扱い。remark-breaks は行を短く切って
  // @react-pdf の Text 内 \n と重なりを起こすため使わない。
  // GFM と CJK 強調はビューアと同じプラグインを使う。
  const processor = unified().use(remarkParse).use(PDF_REMARK_PLUGINS);
  const tree = processor.runSync(processor.parse(content)) as unknown as MdNode;

  return (
    <Document title={title}>
      <Page size="A4" style={styles.page}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>{safe(title)}</Text>
        </View>
        {renderBlocks(tree.children)}
        <Text style={styles.footer} fixed render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
      </Page>
    </Document>
  );
};

export default SkillSheetDocument;
