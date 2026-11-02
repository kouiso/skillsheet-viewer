import { describe, expect, it } from 'vitest';
import { canonicalMigrationJson } from './d1-migration-json';

describe('移行用 JSON の数値を丸めない正規化', () => {
  it('巨大な整数・小数と未知フィールドを保持し、キー順と表記だけをそろえる', () => {
    const first = '{"future":{"n":9007199254740993,"small":0.000000000000000001},"a":[true,null,"日本語"]}';
    const second = '{ "a": [true, null, "\\u65e5本語"], "future": {"small": 1e-18, "n":9007199254740993.0}}';
    expect(canonicalMigrationJson(first)).toBe(canonicalMigrationJson(second));
    expect(canonicalMigrationJson(first)).toContain('9007199254740993');
    expect(canonicalMigrationJson(first)).not.toBe(canonicalMigrationJson(first.replace('993', '992')));
  });

  it.each([
    ['1.2300', '123e-2'],
    ['100', '1e2'],
    ['-10.0e+3', '-1e4'],
    ['0.00100', '1e-3'],
    ['-0.0e999999999', '0'],
    ['1e999999999', '1e999999999'],
    ['"a\\"b"', '"a\\"b"'],
    ['{"__proto__":null}', '{"__proto__":null}'],
  ])('%s を情報を落とさず正規化する', (input, expected) => {
    expect(canonicalMigrationJson(input)).toBe(expected);
    expect(canonicalMigrationJson(expected)).toBe(expected);
  });

  it('配列の順序、空とnull、文字列と数値、欠落と明示nullを区別する', () => {
    for (const [a, b] of [
      ['[1,2]', '[2,1]'],
      ['[]', 'null'],
      ['"1"', '1'],
      ['{}', '{"a":null}'],
    ]) {
      expect(canonicalMigrationJson(a)).not.toBe(canonicalMigrationJson(b));
    }
  });

  it.each([
    '',
    'undefined',
    'NaN',
    'Infinity',
    '01',
    '+1',
    '1.',
    '1e',
    '[1,]',
    '{"a":1,}',
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    'true false',
    '"\\x01"',
    '"\n"',
    '[1 2]',
    '{"a" 1}',
    `${'['.repeat(130)}0${']'.repeat(130)}`,
  ])('不正・曖昧・未対応入力を黙って変更しない (%j)', (input) => {
    expect(() => canonicalMigrationJson(input)).toThrow('INVALID_MIGRATION_JSON');
  });
});
