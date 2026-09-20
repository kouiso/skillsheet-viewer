import { describe, expect, it } from 'vitest';

import { assertE2eDatabaseName, buildMaintenanceUrl, extractDatabaseName, quoteIdent } from './reset-e2e-db';

describe('extractDatabaseName', () => {
  it('URL のパスから dbname を取り出す', () => {
    expect(extractDatabaseName('postgres://u:p@host/skillsheet_e2e?sslmode=require')).toBe('skillsheet_e2e');
  });

  it('dbname が無い URL は拒否する', () => {
    expect(() => extractDatabaseName('postgres://u:p@host')).toThrow();
    expect(() => extractDatabaseName('postgres://u:p@host/')).toThrow();
  });
});

describe('assertE2eDatabaseName', () => {
  it('_e2e サフィックスの DB 名を許可する', () => {
    expect(() => assertE2eDatabaseName('skillsheet_e2e')).not.toThrow();
    expect(() => assertE2eDatabaseName('local_e2e')).not.toThrow();
  });

  it.each(['neondb', 'postgres', 'template0', 'template1'])('共有・保守 DB 名 %s を拒否する', (name) => {
    expect(() => assertE2eDatabaseName(name)).toThrow();
  });

  it('_e2e で終わらない DB 名を拒否する', () => {
    expect(() => assertE2eDatabaseName('skillsheet')).toThrow();
    expect(() => assertE2eDatabaseName('e2e_prod')).toThrow();
  });
});

describe('quoteIdent', () => {
  it('識別子を引用し内側の引用符を重ねる', () => {
    expect(quoteIdent('skillsheet_e2e')).toBe('"skillsheet_e2e"');
    expect(quoteIdent('a"b')).toBe('"a""b"');
  });
});

describe('buildMaintenanceUrl', () => {
  it('dbname だけを差し替えて資格情報・クエリを保持する', () => {
    expect(buildMaintenanceUrl('postgres://u:p@host:5432/skillsheet_e2e?sslmode=require', 'neondb')).toBe(
      'postgres://u:p@host:5432/neondb?sslmode=require',
    );
  });
});
