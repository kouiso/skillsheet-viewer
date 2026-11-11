import { describe, expect, it } from 'vitest';
import { oauthClient } from './auth-schema';
import { readD1Json, writeD1Json } from './json-value';

describe('nullable JSON格納DTOとBetter Auth意味値view', () => {
  it.each([
    null,
    'null',
    '[]',
    'false',
    '[null,"x","x"]',
    '{"n":90071992547409931234567890,"future":false}',
  ])('raw TEXT/SQL NULLを混同も再serializeもしない: %s', (input) => {
    expect(writeD1Json(readD1Json(input))).toBe(input);
    expect(readD1Json(input).kind).toBe(input === null ? 'sql-null' : 'json');
  });
  it('公式SQLite adapterとの二重serializeを避け、意味値viewの巨大数値を丸める前に拒否', () => {
    const text = '{ "n": 90071992547409931234567890, "future": [null,false] }';
    expect(() => oauthClient.metadata.mapFromDriverValue(text)).toThrow('LOSSLESS_JSON_VIEW_REQUIRED');
    expect(writeD1Json(readD1Json(text))).toBe(text);
    expect(oauthClient.metadata.mapToDriverValue('null')).toBeNull();
    for (const raw of ['false', '[]', '[null,"x","x"]', '{"future":false}', '{"ratio":0.5}']) {
      expect(oauthClient.metadata.mapToDriverValue(oauthClient.metadata.mapFromDriverValue(raw))).toBe(raw);
    }
  });
  it('構文不正や非TEXT driver値を拒否', () => {
    expect(() => readD1Json('{')).toThrow();
    expect(() => readD1Json(false)).toThrow('INVALID_D1_JSON');
  });
});
