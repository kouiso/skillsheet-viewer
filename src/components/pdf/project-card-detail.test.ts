import { describe, expect, it } from 'vitest';

import { shouldBreakBeforeComment } from './project-card-detail';

describe('shouldBreakBeforeComment', () => {
  it('コメントが先頭ブロックなら見出し直後で改ページしない', () => {
    expect(shouldBreakBeforeComment(false, 'comment')).toBe(false);
  });

  it('コメントが後続ブロックなら長いカードで改ページする', () => {
    expect(shouldBreakBeforeComment(false, 'duties')).toBe(true);
    expect(shouldBreakBeforeComment(true, 'duties')).toBe(false);
  });
});
