import { describe, expect, it } from 'vitest';

import { companySummaryText } from './company-heading';

describe('companySummaryText', () => {
  it('区切りの「／」の前を改行しない空白にして、「／」が行頭に落ちないようにする', () => {
    const text = companySummaryText({ projectCount: 3, roles: '合成の役割A、合成の役割B', teamRange: '5〜12 名' });
    expect(text).toBe('3 案件 ／ 合成の役割A、合成の役割B ／ 5〜12 名');
    // 「／」の直前に普通の空白が残っていない
    expect(text).not.toMatch(/ ／/);
  });

  it('空の項目は飛ばし、区切りを重ねない', () => {
    expect(companySummaryText({ projectCount: 1, roles: '', teamRange: '1 名' })).toBe('1 案件 ／ 1 名');
  });
});
