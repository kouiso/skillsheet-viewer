import { describe, expect, it } from 'vitest';

import { matchesSearchTerms, parseProjectQuery, techMatchesQuery } from './project-search';

describe('parseProjectQuery / matchesSearchTerms', () => {
  it('全角 ＴｙｐｅＳｃｒｉｐｔ を NFKC でヒットする', () => {
    const { terms, requireAll } = parseProjectQuery('ＴｙｐｅＳｃｒｉｐｔ');
    expect(matchesSearchTerms('TypeScript React', terms, requireAll)).toBe(true);
  });

  it('スペース区切りは OR', () => {
    const { terms, requireAll } = parseProjectQuery('React Vue');
    expect(requireAll).toBe(false);
    expect(matchesSearchTerms('React の案件', terms, requireAll)).toBe(true);
    expect(matchesSearchTerms('Vue の案件', terms, requireAll)).toBe(true);
    expect(matchesSearchTerms('Go の案件', terms, requireAll)).toBe(false);
  });

  it('AND と書いたときだけ全語一致', () => {
    const { terms, requireAll } = parseProjectQuery('React AND Vue');
    expect(requireAll).toBe(true);
    expect(terms).toEqual(['react', 'vue']);
    expect(matchesSearchTerms('React と Vue', terms, requireAll)).toBe(true);
    expect(matchesSearchTerms('React だけ', terms, requireAll)).toBe(false);
  });

  it('クエリ一致チップ判定は activeTech を見ない', () => {
    expect(techMatchesQuery('TypeScript', ['typescript'])).toBe(true);
    expect(techMatchesQuery('Go', ['typescript'])).toBe(false);
  });
});
