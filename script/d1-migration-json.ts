// JSONB を JS number に変換すると、正しい入力まで丸まる。数値トークンを文字列のまま正規化する。
export function canonicalMigrationJson(source: string): string {
  let offset = 0;
  function fail(): never {
    // 本文・鍵・トークンが入力に含まれ得るため、エラーに値や位置を載せない。
    throw new Error('INVALID_MIGRATION_JSON');
  }
  function whitespace() {
    while (/[\t\n\r ]/.test(source[offset] ?? '') && offset < source.length) offset++;
  }
  function string(): string {
    const start = offset++;
    while (offset < source.length) {
      const char = source[offset++];
      if (char === '\\') offset++;
      else if (char === '"') {
        try {
          return JSON.parse(source.slice(start, offset));
        } catch {
          fail();
        }
      }
    }
    return fail();
  }
  function value(depth: number): string {
    // 異常な深さで call stack を落とさず、未対応の入力として停止する。
    if (depth > 128) fail();
    whitespace();
    const char = source[offset];
    if (char === '"') return JSON.stringify(string());
    if (char === '{') {
      offset++;
      whitespace();
      const entries = new Map<string, string>();
      if (source[offset] !== '}') {
        while (true) {
          whitespace();
          if (source[offset] !== '"') fail();
          const key = string();
          if (entries.has(key)) fail();
          whitespace();
          if (source[offset++] !== ':') fail();
          entries.set(key, value(depth + 1));
          whitespace();
          if (source[offset] !== ',') break;
          offset++;
        }
      }
      if (source[offset++] !== '}') fail();
      return `{${[...entries.keys()]
        .sort()
        .map((key) => `${JSON.stringify(key)}:${entries.get(key)}`)
        .join(',')}}`;
    }
    if (char === '[') {
      offset++;
      whitespace();
      const entries: string[] = [];
      if (source[offset] !== ']') {
        while (true) {
          entries.push(value(depth + 1));
          whitespace();
          if (source[offset] !== ',') break;
          offset++;
        }
      }
      if (source[offset++] !== ']') fail();
      return `[${entries.join(',')}]`;
    }
    for (const literal of ['null', 'true', 'false']) {
      if (source.startsWith(literal, offset)) {
        offset += literal.length;
        return literal;
      }
    }
    const token = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?/.exec(source.slice(offset));
    if (!token) return fail();
    offset += token[0].length;
    const digits = `${token[2]}${token[3] ?? ''}`.replace(/^0+/, '').replace(/0+$/, '');
    if (!digits) return '0';
    const allDigits = `${token[2]}${token[3] ?? ''}`;
    const trailingZeros = allDigits.length - allDigits.replace(/0+$/, '').length;
    const exponent = BigInt(token[4] ?? '0') - BigInt(token[3]?.length ?? 0) + BigInt(trailingZeros);
    // 展開せず指数表記にするため、極端な指数でも巨大な文字列を生成しない。
    return `${token[1]}${digits}${exponent === 0n ? '' : `e${exponent}`}`;
  }
  const result = value(0);
  whitespace();
  if (offset !== source.length) fail();
  return result;
}
