import { isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createSkillSheetPdf } from './pdf-export';

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

describe('createSkillSheetPdf', () => {
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

  it('should render PDF document with title', async () => {
    const element = await createSkillSheetPdf({ title: mockTitle, content: mockContent });
    expect(isValidElement(element)).toBe(true);
  });

  it('should handle empty content', async () => {
    const element = await createSkillSheetPdf({ title: mockTitle, content: '' });
    expect(isValidElement(element)).toBe(true);
  });

  it('should handle content with only headings', async () => {
    const headingContent = `
# Heading 1
## Heading 2
### Heading 3
    `.trim();
    const element = await createSkillSheetPdf({ title: mockTitle, content: headingContent });
    expect(isValidElement(element)).toBe(true);
  });

  it('should handle content with lists', async () => {
    const listContent = `
- Item 1
- Item 2
- Item 3

1. Numbered item 1
2. Numbered item 2
    `.trim();
    const element = await createSkillSheetPdf({ title: mockTitle, content: listContent });
    expect(isValidElement(element)).toBe(true);
  });

  it('should handle content with code blocks', async () => {
    const codeContent = `
\`\`\`javascript
const hello = 'world';
console.log(hello);
\`\`\`
    `.trim();
    const element = await createSkillSheetPdf({ title: mockTitle, content: codeContent });
    expect(isValidElement(element)).toBe(true);
  });

  it('should handle content with blockquotes', async () => {
    const quoteContent = `
> This is a quote
> Multiple lines
    `.trim();
    const element = await createSkillSheetPdf({ title: mockTitle, content: quoteContent });
    expect(isValidElement(element)).toBe(true);
  });

  it('should handle content with horizontal rules', async () => {
    const hrContent = `
Some text

---

More text
    `.trim();
    const element = await createSkillSheetPdf({ title: mockTitle, content: hrContent });
    expect(isValidElement(element)).toBe(true);
  });

  it('should handle content with inline markdown', async () => {
    const inlineContent = `
This is **bold** and *italic* text.
This is \`inline code\`.
This is [a link](https://example.com).
    `.trim();
    const element = await createSkillSheetPdf({ title: mockTitle, content: inlineContent });
    expect(isValidElement(element)).toBe(true);
  });

  it('should handle complex mixed content', async () => {
    const element = await createSkillSheetPdf({ title: mockTitle, content: mockContent });
    expect(isValidElement(element)).toBe(true);
  });

  it('should render with special characters in title', async () => {
    const specialTitle = 'スキルシート_テスト & Special <Characters> 123';
    const element = await createSkillSheetPdf({ title: specialTitle, content: mockContent });
    expect(isValidElement(element)).toBe(true);
  });

  it('should handle very long content', async () => {
    const longContent = Array(100).fill('これは長いテキストです。').join('\n\n');
    const element = await createSkillSheetPdf({ title: mockTitle, content: longContent });
    expect(isValidElement(element)).toBe(true);
  });
});
