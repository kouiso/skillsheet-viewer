import { describe, expect, it } from 'vitest';
import { fitContinuationHeading } from './print-continuation-heading';

describe('fitContinuationHeading', () => {
  it('会社名と案件名が 1 行に収まるときは両方出す', () => {
    expect(fitContinuationHeading('M 社', '販売システム')).toBe('M 社（つづき）　販売システム（続き）');
  });

  it('収まらないときは会社名を落として案件名を残す（跨いだ先で必要なのは案件名）', () => {
    const project = 'あ'.repeat(30);
    const text = fitContinuationHeading('と'.repeat(20), project);
    expect(text).toBe(`${project}（続き）`);
  });

  it('案件名だけでも収まらないときは末尾を … で詰める', () => {
    const text = fitContinuationHeading('会社', 'ん'.repeat(80));
    expect(text.endsWith('…')).toBe(true);
    expect([...text].length).toBeLessThan(80);
  });

  it('どちらも空なら見出しごと出さない', () => {
    expect(fitContinuationHeading(undefined, undefined)).toBe('');
  });
});
