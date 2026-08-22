export function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLowerCase();
}

export function parseProjectQuery(query: string): { terms: string[]; requireAll: boolean } {
  const tokens = query
    .trim()
    .normalize('NFKC')
    .split(/[\s、]+/)
    .filter(Boolean);
  const isOp = (token: string) => /^(and|or)$/i.test(token);
  const terms = tokens.filter((token) => !isOp(token)).map((token) => token.toLowerCase());
  return { terms, requireAll: tokens.some((token) => /^and$/i.test(token)) };
}

export function matchesSearchTerms(haystack: string, terms: string[], requireAll: boolean): boolean {
  if (terms.length === 0) return true;
  const hay = normalizeSearchText(haystack);
  return requireAll ? terms.every((term) => hay.includes(term)) : terms.some((term) => hay.includes(term));
}

export function techMatchesQuery(name: string, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const hay = normalizeSearchText(name);
  return terms.some((term) => hay.includes(term));
}

export const SEARCH_HINT_OR = 'スペース区切りはどれかを含む案件（OR）。AND と書くとすべて含む案件だけに絞ります。';
export const SEARCH_HINT_AND = 'AND が入っているので、すべての語を含む案件だけを表示しています。';
