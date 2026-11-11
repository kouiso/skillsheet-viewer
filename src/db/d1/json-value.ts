import { customType } from 'drizzle-orm/sqlite-core';

/** SQL NULL と JSON null は同じ JS null に潰さず、保存境界でタグ付きDTOにする。 */
export type D1JsonValue = { kind: 'sql-null' } | { kind: 'json'; text: string };

export function readD1Json(value: unknown): D1JsonValue {
  if (value === null) return { kind: 'sql-null' };
  if (typeof value !== 'string') throw new Error('INVALID_D1_JSON');
  JSON.parse(value); // 構文だけを検証し、数値の再serializeはしない。
  return { kind: 'json', text: value };
}

export function writeD1Json(value: D1JsonValue): string | null {
  if (value.kind === 'sql-null') return null;
  return readD1Json(value.text).kind === 'json' ? value.text : null;
}

function decimalIdentity(token: string) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  if (!match) throw new Error('INVALID_D1_JSON');
  const digits = `${match[2]}${match[3] ?? ''}`.replace(/^0+/, '');
  if (!digits) return '0';
  const significant = digits.replace(/0+$/, '');
  return `${match[1]}${significant}e${BigInt(match[4] ?? '0') - BigInt(match[3]?.length ?? 0) + BigInt(digits.length - significant.length)}`;
}

// 公式SQLite adapterはJSON/配列を自身でserialize/parseする。Drizzleでもparseすると
// 二重serializeになる。意味値viewで扱えない数値は丸める前に拒否し、raw DTOに残す。
export const authJson = customType<{ data: string; driverData: string | null }>({
  dataType: () => 'text',
  fromDriver(text) {
    if (text === null) throw new Error('INVALID_D1_JSON'); // SQL NULLはDrizzleがmapper前に処理する。
    readD1Json(text);
    const numbers = text.replace(/"(?:[^"\\]|\\.)*"/g, '""').match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g) ?? [];
    if (
      numbers.some((number) => {
        const parsed = Number(number);
        return (
          !Number.isFinite(parsed) ||
          (Number.isInteger(parsed) && !Number.isSafeInteger(parsed)) ||
          decimalIdentity(number) !== decimalIdentity(String(parsed))
        );
      })
    )
      throw new Error('LOSSLESS_JSON_VIEW_REQUIRED');
    return text;
  },
  toDriver(value) {
    readD1Json(value);
    // 既存PG adapterと同じ: 意味値APIの明示nullはSQL NULLへのclear。
    // literal JSON nullの保存／逆移送はタグ付きraw DTOだけで行う。
    return value === 'null' ? null : value;
  },
});
