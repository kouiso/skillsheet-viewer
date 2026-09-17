import { describe, expect, it } from 'vitest';
import { skillSheets, skillsheetState } from './schema';

describe('文書永続化の型契約', () => {
  it('PG BIGINTをNumberに丸めず受け取り、初期版0を使う', () => {
    expect(skillSheets.revision.getSQLType()).toBe('bigint');
    expect(skillSheets.revision.mapFromDriverValue('9007199254740993')).toBe(9007199254740993n);
    expect(skillSheets.revision.default).toBe(0n);
    expect(skillSheets.revision.notNull).toBe(true);
  });
  it('削除済みUUID履歴を非NULL配列として保持する', () => {
    expect(skillsheetState.deletedSheetIds.getSQLType()).toBe('uuid[]');
    expect(skillsheetState.deletedSheetIds.notNull).toBe(true);
    const id = '00000000-0000-4000-8000-000000000001';
    expect(skillsheetState.deletedSheetIds.mapFromDriverValue(`{${id}}`)).toEqual([id]);
  });
});
