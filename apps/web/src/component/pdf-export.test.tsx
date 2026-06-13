import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SkillSheetPDF } from './pdf-export';

// @react-pdf/renderer のモック
vi.mock('@react-pdf/renderer', async () => {
  const actual = await vi.importActual<typeof import('@react-pdf/renderer')>('@react-pdf/renderer');
  return {
    ...actual,
    Font: {
      register: vi.fn(),
    },
  };
});

describe('SkillSheetPDF', () => {
  const mockTitle = 'テストスキルシート';
  const mockContent = `
# 見出し1

これはテスト段落です。

## 見出し2

- リスト項目1
- リスト項目2
- リスト項目3

### 見出し3

\`\`\`javascript
const test = 'code';
\`\`\`

> これは引用です

---

**太字テキスト**と*イタリックテキスト*
  `.trim();

  it('should render PDF document with title', () => {
    const { container } = render(<SkillSheetPDF title={mockTitle} content={mockContent} />);
    expect(container).toBeDefined();
  });

  it('should handle empty content', () => {
    const { container } = render(<SkillSheetPDF title={mockTitle} content="" />);
    expect(container).toBeDefined();
  });

  it('should handle content with only headings', () => {
    const headingContent = `
# Heading 1
## Heading 2
### Heading 3
    `.trim();
    const { container } = render(<SkillSheetPDF title={mockTitle} content={headingContent} />);
    expect(container).toBeDefined();
  });

  it('should handle content with lists', () => {
    const listContent = `
- Item 1
- Item 2
- Item 3

1. Numbered item 1
2. Numbered item 2
    `.trim();
    const { container } = render(<SkillSheetPDF title={mockTitle} content={listContent} />);
    expect(container).toBeDefined();
  });

  it('should handle content with code blocks', () => {
    const codeContent = `
\`\`\`javascript
const hello = 'world';
console.log(hello);
\`\`\`
    `.trim();
    const { container } = render(<SkillSheetPDF title={mockTitle} content={codeContent} />);
    expect(container).toBeDefined();
  });

  it('should handle content with blockquotes', () => {
    const quoteContent = `
> This is a quote
> Multiple lines
    `.trim();
    const { container } = render(<SkillSheetPDF title={mockTitle} content={quoteContent} />);
    expect(container).toBeDefined();
  });

  it('should handle content with horizontal rules', () => {
    const hrContent = `
Some text

---

More text
    `.trim();
    const { container } = render(<SkillSheetPDF title={mockTitle} content={hrContent} />);
    expect(container).toBeDefined();
  });

  it('should handle content with inline markdown', () => {
    const inlineContent = `
This is **bold** and *italic* text.
This is \`inline code\`.
This is [a link](https://example.com).
    `.trim();
    const { container } = render(<SkillSheetPDF title={mockTitle} content={inlineContent} />);
    expect(container).toBeDefined();
  });

  it('should handle complex mixed content', () => {
    const { container } = render(<SkillSheetPDF title={mockTitle} content={mockContent} />);
    expect(container).toBeDefined();
  });

  it('should render with special characters in title', () => {
    const specialTitle = 'スキルシート_テスト & Special <Characters> 123';
    const { container } = render(<SkillSheetPDF title={specialTitle} content={mockContent} />);
    expect(container).toBeDefined();
  });

  it('should handle very long content', () => {
    const longContent = Array(100).fill('これは長いテキストです。').join('\n\n');
    const { container } = render(<SkillSheetPDF title={mockTitle} content={longContent} />);
    expect(container).toBeDefined();
  });
});
