import { describe, expect, it } from 'vitest';
import { fitContinuationHeading, fitContinuationHeadingParts } from './print-continuation-heading';

describe('fitContinuationHeading', () => {
  it('会社名と案件名が 1 行に収まるときは両方出す', () => {
    expect(fitContinuationHeading('M 社', '販売システム')).toBe('M 社 ／ 販売システム （続き）');
  });

  it('収まらないときは会社名を落として案件名を残す（跨いだ先で必要なのは案件名）', () => {
    const project = 'あ'.repeat(30);
    const text = fitContinuationHeading('と'.repeat(20), project);
    expect(text).toBe(`${project} （続き）`);
  });

  it('案件名だけでも収まらないときは末尾を … で詰める', () => {
    const text = fitContinuationHeading('会社', 'ん'.repeat(80));
    expect(text.endsWith('…')).toBe(true);
    expect([...text].length).toBeLessThan(80);
  });

  it('片は 3 トーン（会社=company / 「／」「（続き）」=separator・mark / 案件名=project）に分かれる', () => {
    expect(fitContinuationHeadingParts('Q 社', 'マッチングアプリの開発')).toEqual([
      { text: 'Q 社', tone: 'company' },
      { text: ' ／ ', tone: 'separator' },
      { text: 'マッチングアプリの開発', tone: 'project' },
      { text: ' （続き）', tone: 'mark' },
    ]);
  });

  it('会社だけが続くときは「（つづき）」（案件側の「（続き）」と字を分ける）', () => {
    expect(fitContinuationHeading('Q 社', undefined)).toBe('Q 社 （つづき）');
  });

  it('1 行に「つづき」と「続き」を混ぜない', () => {
    for (const [company, project] of [
      ['Q 社', '案件'],
      ['Q 社', undefined],
      [undefined, '案件'],
    ] as const) {
      const text = fitContinuationHeading(company, project);
      expect(text.includes('つづき') && text.includes('続き')).toBe(false);
    }
  });

  it('どちらも空なら見出しごと出さない', () => {
    expect(fitContinuationHeading(undefined, undefined)).toBe('');
  });
});
