import { describe, expect, it } from 'vitest';
import { sanitizeHtml, sanitizeMarkdown } from './sanitize-html';

describe('sanitizeHtml', () => {
  it('<script> とその内容を除去する', () => {
    const input = `${'A'.repeat(50)}<script>alert(1)</script>`;
    expect(sanitizeHtml(input)).toBe('A'.repeat(50));
    expect(sanitizeHtml(input)).not.toContain('alert(1)');
  });

  it('大文字・混在 <ScRiPt> も除去する', () => {
    const input = 'text<ScRiPt>alert(1)</ScRiPt>end';
    expect(sanitizeHtml(input)).toBe('textend');
  });

  it('複数行・属性付き <script> も除去する', () => {
    const input = 'a\n<script type="text/javascript" src="x">\nalert(1)\nconsole.log(2)\n</script>\nb';
    expect(sanitizeHtml(input)).toBe('a\n\nb');
  });

  it('その他のHTMLタグも除去する', () => {
    expect(sanitizeHtml('hello <b>world</b>')).toBe('hello world');
    expect(sanitizeHtml('foo<br/>bar')).toBe('foobar');
  });

  it('空・null・undefined は空文字を返す', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml(undefined)).toBe('');
  });
});

describe('sanitizeMarkdown', () => {
  it('<script> とその内容だけを取り除く', () => {
    const input = `${'A'.repeat(50)}<script>alert(1)</script>`;
    expect(sanitizeMarkdown(input)).toBe('A'.repeat(50));
  });

  it('<style> とその内容も取り除く', () => {
    const input = 'a<style>body{color:red}</style>b';
    expect(sanitizeMarkdown(input)).toBe('ab');
  });

  it('<details> や <summary> は保持する', () => {
    const input = '<details open>\n<summary><h2>スキル</h2></summary>\n| 言語 | TypeScript |\n</details>';
    expect(sanitizeMarkdown(input)).toBe(input);
  });

  it('空・null・undefined は空文字を返す', () => {
    expect(sanitizeMarkdown('')).toBe('');
    expect(sanitizeMarkdown(null)).toBe('');
    expect(sanitizeMarkdown(undefined)).toBe('');
  });
});
