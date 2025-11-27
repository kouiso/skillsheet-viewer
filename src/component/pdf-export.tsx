import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';

// 日本語フォントの登録 (Noto Sans JP)
Font.register({
  family: 'Noto Sans JP',
  fonts: [
    {
      src: 'https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj757Y0rw_qMHVdbR2L8Y9hrwv.ttf',
      fontWeight: 400,
    },
    {
      src: 'https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj757Y0rw_qMHVdbR2L8Y9hrwv.ttf',
      fontWeight: 700,
    },
  ],
});

// PDFスタイルの定義
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Noto Sans JP',
    fontSize: 10,
    lineHeight: 1.6,
  },
  title: {
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 20,
    color: '#1976d2',
    borderBottom: '2px solid #1976d2',
    paddingBottom: 10,
  },
  heading1: {
    fontSize: 18,
    fontWeight: 700,
    marginTop: 20,
    marginBottom: 10,
    color: '#1976d2',
    borderBottom: '1px solid #e0e0e0',
    paddingBottom: 5,
  },
  heading2: {
    fontSize: 14,
    fontWeight: 700,
    marginTop: 15,
    marginBottom: 8,
    color: '#333333',
  },
  heading3: {
    fontSize: 12,
    fontWeight: 700,
    marginTop: 12,
    marginBottom: 6,
    color: '#555555',
  },
  paragraph: {
    marginBottom: 10,
    textAlign: 'justify',
  },
  listItem: {
    marginLeft: 15,
    marginBottom: 5,
    flexDirection: 'row',
  },
  listBullet: {
    width: 15,
  },
  listContent: {
    flex: 1,
  },
  codeBlock: {
    backgroundColor: '#f5f5f5',
    padding: 10,
    marginVertical: 10,
    borderRadius: 4,
    fontFamily: 'Courier',
    fontSize: 9,
  },
  inlineCode: {
    backgroundColor: '#f5f5f5',
    padding: 2,
    borderRadius: 2,
    fontFamily: 'Courier',
    fontSize: 9,
  },
  blockquote: {
    borderLeft: '4px solid #1976d2',
    paddingLeft: 10,
    marginVertical: 10,
    fontStyle: 'italic',
    color: '#666666',
  },
  table: {
    marginVertical: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tableHeader: {
    backgroundColor: '#f5f5f5',
    fontWeight: 700,
  },
  tableCell: {
    padding: 8,
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  link: {
    color: '#1976d2',
    textDecoration: 'underline',
  },
  hr: {
    borderBottom: '1px solid #e0e0e0',
    marginVertical: 15,
  },
});

interface MarkdownElement {
  type: 'title' | 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'list' | 'codeBlock' | 'blockquote' | 'hr';
  content: string;
  items?: string[];
}

/**
 * Markdownテキストを解析してPDF用の要素に変換
 */
const parseMarkdown = (markdown: string): MarkdownElement[] => {
  const lines = markdown.split('\n');
  const elements: MarkdownElement[] = [];
  let currentParagraph = '';
  let currentCodeBlock = '';
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // コードブロックの処理
    if (line.startsWith('```')) {
      if (inCodeBlock && currentCodeBlock) {
        elements.push({ type: 'codeBlock', content: currentCodeBlock.trim() });
        currentCodeBlock = '';
      }
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      currentCodeBlock += line + '\n';
      continue;
    }

    // 見出しの処理
    if (line.startsWith('# ')) {
      if (currentParagraph) {
        elements.push({ type: 'paragraph', content: currentParagraph.trim() });
        currentParagraph = '';
      }
      elements.push({ type: 'heading1', content: line.slice(2) });
      continue;
    }

    if (line.startsWith('## ')) {
      if (currentParagraph) {
        elements.push({ type: 'paragraph', content: currentParagraph.trim() });
        currentParagraph = '';
      }
      elements.push({ type: 'heading2', content: line.slice(3) });
      continue;
    }

    if (line.startsWith('### ')) {
      if (currentParagraph) {
        elements.push({ type: 'paragraph', content: currentParagraph.trim() });
        currentParagraph = '';
      }
      elements.push({ type: 'heading3', content: line.slice(4) });
      continue;
    }

    // 水平線の処理
    if (line.match(/^[-*_]{3,}$/)) {
      if (currentParagraph) {
        elements.push({ type: 'paragraph', content: currentParagraph.trim() });
        currentParagraph = '';
      }
      elements.push({ type: 'hr', content: '' });
      continue;
    }

    // 引用の処理
    if (line.startsWith('> ')) {
      if (currentParagraph) {
        elements.push({ type: 'paragraph', content: currentParagraph.trim() });
        currentParagraph = '';
      }
      elements.push({ type: 'blockquote', content: line.slice(2) });
      continue;
    }

    // リストの処理
    if (line.match(/^[-*+]\s/) || line.match(/^\d+\.\s/)) {
      if (currentParagraph) {
        elements.push({ type: 'paragraph', content: currentParagraph.trim() });
        currentParagraph = '';
      }
      const content = line.replace(/^[-*+]\s/, '').replace(/^\d+\.\s/, '');
      elements.push({ type: 'list', content, items: [content] });
      continue;
    }

    // 空行の処理
    if (line.trim() === '') {
      if (currentParagraph) {
        elements.push({ type: 'paragraph', content: currentParagraph.trim() });
        currentParagraph = '';
      }
      continue;
    }

    // 通常のテキスト
    currentParagraph += (currentParagraph ? ' ' : '') + line;
  }

  // 最後の段落を追加
  if (currentParagraph) {
    elements.push({ type: 'paragraph', content: currentParagraph.trim() });
  }

  return elements;
};

/**
 * インラインのMarkdown記法を削除
 */
const cleanInlineMarkdown = (text: string): string => {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1') // Bold
    .replace(/\*(.+?)\*/g, '$1') // Italic
    .replace(/__(.+?)__/g, '$1') // Bold
    .replace(/_(.+?)_/g, '$1') // Italic
    .replace(/`(.+?)`/g, '$1') // Inline code
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // Links
    .replace(/!\[.+?\]\(.+?\)/g, '') // Images
    .replace(/~~(.+?)~~/g, '$1'); // Strikethrough
};

interface PDFDocumentProps {
  title: string;
  content: string;
}

/**
 * PDFドキュメントコンポーネント
 */
export const SkillSheetPDF = ({ title, content }: PDFDocumentProps) => {
  const elements = parseMarkdown(content);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* タイトル */}
        <View>
          <Text style={styles.title}>{title}</Text>
        </View>

        {/* コンテンツ */}
        {elements.map((element, index) => {
          const cleanContent = cleanInlineMarkdown(element.content);

          switch (element.type) {
            case 'heading1':
              return (
                <View key={index}>
                  <Text style={styles.heading1}>{cleanContent}</Text>
                </View>
              );

            case 'heading2':
              return (
                <View key={index}>
                  <Text style={styles.heading2}>{cleanContent}</Text>
                </View>
              );

            case 'heading3':
              return (
                <View key={index}>
                  <Text style={styles.heading3}>{cleanContent}</Text>
                </View>
              );

            case 'paragraph':
              return (
                <View key={index}>
                  <Text style={styles.paragraph}>{cleanContent}</Text>
                </View>
              );

            case 'list':
              return (
                <View key={index} style={styles.listItem}>
                  <Text style={styles.listBullet}>• </Text>
                  <Text style={styles.listContent}>{cleanContent}</Text>
                </View>
              );

            case 'codeBlock':
              return (
                <View key={index}>
                  <Text style={styles.codeBlock}>{element.content}</Text>
                </View>
              );

            case 'blockquote':
              return (
                <View key={index} style={styles.blockquote}>
                  <Text>{cleanContent}</Text>
                </View>
              );

            case 'hr':
              return <View key={index} style={styles.hr} />;

            default:
              return null;
          }
        })}
      </Page>
    </Document>
  );
};

export default SkillSheetPDF;
