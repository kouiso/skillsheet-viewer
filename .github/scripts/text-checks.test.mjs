// text-checks のテスト（#615）。判定の本体は brain #110 の写し（Python）で、ここでは
// ①写しが元のコミットから一字もずれていないこと、②写しが本体と同じ結果を返すこと（本体の examples）、
// ③呼び出し側（text-checks-caller.cjs）が規則名だけを返し、当たった文字や追加の語を出さないことを確かめる。
// 秘密の形の例は、検査ツールに本物と間違われないよう文字をつないで作る（どれも作り物）。
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const caller = require('./text-checks-caller.cjs');
const config = require('../text-checks.config.json');
const source = require('../text-checks.source.json');

const ROOT = path.resolve(import.meta.dirname, '../..');
const EXAMPLES = path.join(caller.CHECKS_DIR, 'examples');
const example = (name) => readFileSync(path.join(EXAMPLES, name), 'utf8');
const join = (...parts) => parts.join('');

function listFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

describe('写しのずれ検査（brain #110 の本体）', () => {
  test('元のリポと固定したコミットが書いてある', () => {
    expect(source.status).toBe('vendored');
    expect(source.repo).toBe('kouiso/brain');
    expect(source.issue).toBe(110);
    expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  test.each(source.files.map((f) => [f.path, f]))('%s が写したときの中身と一致する', (_p, f) => {
    const actual = createHash('sha256')
      .update(readFileSync(path.join(ROOT, f.path)))
      .digest('hex');
    expect(actual).toBe(f.sha256);
  });

  test('写しの置き場所には、記録にないファイルが無い', () => {
    const listed = source.files.map((f) => f.path).sort();
    const present = listFiles(caller.CHECKS_DIR)
      .map((p) => path.relative(ROOT, p))
      .filter((p) => !p.includes('__pycache__'))
      .sort();
    expect(present).toEqual(listed);
  });
});

describe('写しが本体と同じ結果を返す（本体の examples）', () => {
  test('issue_ok は緑、issue_ng は本体と同じ3件で赤', () => {
    expect(caller.runFormatCheck(example('issue_ok.md'), 'issue')).toEqual({ ok: true, problems: [] });
    expect(caller.runFormatCheck(example('issue_ng.md'), 'issue')).toEqual({
      ok: false,
      problems: ['「今どこまで」が未記入です', '「次にやること」が未記入です', '見出し「誰の判断待ち」がありません'],
    });
  });

  test('pr_ok は緑、pr_ng は本体と同じ2件で赤', () => {
    expect(caller.runFormatCheck(example('pr_ok.md'), 'pr')).toEqual({ ok: true, problems: [] });
    expect(caller.runFormatCheck(example('pr_ng.md'), 'pr')).toEqual({
      ok: false,
      problems: ['見出し「変更内容」がありません', '「関連Issue」に `Closes #番号` か `Refs #番号` がありません'],
    });
  });

  test('public_ok は緑（コミット番号は注意だけで止めない）', () => {
    const r = caller.runPublicCheck(example('public_ok.md'));
    expect(r.ok).toBe(true);
    expect(r.hits).toEqual([]);
  });

  test('直すと赤から緑に変わる', () => {
    const fixed = example('issue_ng.md')
      .replace('### 今どこまで\n-', '### 今どこまで\n- 作った')
      .replace('<!-- ここに書く -->', '- 呼ぶ側を作る\n\n## 誰の判断待ち\n- 副長');
    expect(caller.runFormatCheck(fixed, 'issue').ok).toBe(true);
  });
});

describe('公開内容チェック（呼び出し側）', () => {
  const FAKE = {
    '秘密の値(よくある鍵の形)': join('これを使う: ', 'gh', 'p_', 'EXAMPLEONLY0000'),
    'DBの名前・接続先': join('接続先は ', 'postgres', '://example/test'),
    メールアドレス: join('連絡先は someone', '@', 'example.com'),
    金額: join('見積もりは 120,000', '円'),
  };

  test.each(Object.entries(FAKE))('作り物の例で赤になる: %s', (rule, text) => {
    const r = caller.runPublicCheck(`ふつうの1行目\n${text}`);
    expect(r.ok).toBe(false);
    expect(r.hits).toContainEqual({ rule, line: 2, count: 1 });
  });

  test('知らせる文には規則の名前と行だけを書き、当たった文字は書かない', () => {
    const text = FAKE.メールアドレス;
    const report = caller.formatReport('public', caller.runPublicCheck(text), config);
    expect(report.startsWith(`${config.marker}:public\n`)).toBe(true);
    expect(report).toContain('- メールアドレス: 1件、1行目');
    expect(report).not.toContain('example.com');
  });

  test('本文が空なら公開内容は OK（本体の終了コード 2）', () => {
    expect(caller.runPublicCheck('').ok).toBe(true);
    expect(caller.runPublicCheck('  \n').ok).toBe(true);
  });
});

describe('追加の禁止語（secret から一時ファイルで渡す）', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'text-checks-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  test('未設定なら一時ファイルを作らず、一般の規則だけで判定する', () => {
    expect(caller.writeExtraFile(undefined, dir)).toBeNull();
    expect(caller.writeExtraFile('  \n', dir)).toBeNull();
    expect(caller.runPublicCheck('サンプル商事さんの件', { extraFile: null }).ok).toBe(true);
  });

  test('語が当たると赤、知らせる文に語は出ない（規則名は番号だけ）', () => {
    const file = caller.writeExtraFile('# 注釈\nサンプル商事', dir);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const r = caller.runPublicCheck('サンプル商事さんの件', { extraFile: file });
    expect(r.hits).toEqual([{ rule: '追加の禁止語 1 番目', line: 1, count: 1 }]);
    const report = caller.formatReport('public', r, config, 'public-body');
    expect(report.startsWith(`${config.marker}:public-body\n`)).toBe(true);
    expect(report).not.toContain('サンプル商事');
  });
});

describe('対象外と知らせる文', () => {
  test('ボット・下書き PR・アラート系ラベルは書き方チェックを飛ばす', () => {
    expect(caller.shouldSkipFormat({ kind: 'issue', author: 'github-actions[bot]' }, config)).toBe(true);
    expect(caller.shouldSkipFormat({ kind: 'pull_request', author: 'someone', draft: true }, config)).toBe(true);
    expect(caller.shouldSkipFormat({ kind: 'issue', author: 'someone', labels: ['ci-failure'] }, config)).toBe(true);
    expect(caller.shouldSkipFormat({ kind: 'issue', author: 'someone', labels: ['bug'] }, config)).toBe(false);
    expect(caller.shouldSkipFormat({ kind: 'pull_request', author: 'someone', draft: false }, config)).toBe(false);
  });

  test('書き方の結果の文は目印で始まり、足りないものを本体の文のまま並べる', () => {
    const r = caller.runFormatCheck(example('pr_ng.md'), 'pr');
    const report = caller.formatReport('format', r, config);
    expect(report.split('\n')[0]).toBe(`${config.marker}:format`);
    expect(report).toContain('- 見出し「変更内容」がありません');
    expect(caller.formatReport('format', { ok: true, problems: [] }, config)).toBe(
      `${config.marker}:format\n書き方チェック: OK`,
    );
  });
});
