// text-checks.cjs のテスト（#615）。workflow 側は CJS のまま require するので、
// テストは ESM にして createRequire で読む（devin-slack-relay.test.mjs と同じ形）。
// 秘密の形の例は、検査ツールに本物と間違われないよう文字をつないで作る（どれも作り物）。
import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const checks = require('./text-checks.cjs');
const config = require('../text-checks.config.json');

const join = (...parts) => parts.join('');

const GOOD_ISSUE = [
  '## 背景',
  'このリポは公開されている。',
  '## 今どこまで',
  '- 調べた（2026-10-29）',
  '## 次にやること',
  '1. 公開内容チェックを入れる',
  '## 誰の判断待ち',
  '- 磯貝さん: 入れてよいか',
  '## 完了条件',
  '- 赤と緑をテストで確かめた',
].join('\n');

const GOOD_PR = [
  '## 概要',
  '書き方チェックを入れる。',
  '## 変更内容',
  '- workflow と設定を足した',
  '## 関連Issue',
  'Refs #615',
].join('\n');

describe('書き方チェック（issue）', () => {
  test('5つの見出しがそろっていれば OK', () => {
    expect(checks.checkIssueFormat(GOOD_ISSUE, config)).toEqual({ ok: true, missing: [] });
  });

  test('見出しが無いと赤になり、足りない見出しの名前が出る', () => {
    const body = GOOD_ISSUE.replace('## 誰の判断待ち\n- 磯貝さん: 入れてよいか\n', '');
    const r = checks.checkIssueFormat(body, config);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual([{ name: '誰の判断待ち', reason: '見出しがない' }]);
  });

  test('見出しだけ・「-」だけ・コメントだけ・_No response_ は未記入', () => {
    const body = GOOD_ISSUE.replace('- 調べた（2026-10-29）', '-')
      .replace('1. 公開内容チェックを入れる', '<!-- ここに書く -->')
      .replace('- 赤と緑をテストで確かめた', '_No response_');
    const r = checks.checkIssueFormat(body, config);
    expect(r.ok).toBe(false);
    expect(r.missing.map((m) => m.name)).toEqual(['今どこまで', '次にやること', '完了条件']);
    expect(r.missing.every((m) => m.reason === '中身が書いていない')).toBe(true);
  });

  test('フォームの「###」見出しと別名（完成の定義など）も数える', () => {
    const body = [
      '### (Why?)なぜ、このタスクをやるのか？',
      '理由',
      '### 今どこまで',
      '途中',
      '### (How To ?) やり方の指定があるか？',
      'なし',
      '### 誰の判断待ち',
      '山南',
      '### (Complete!) 完成の定義(箇条書き)',
      '- 動く',
    ].join('\n');
    expect(checks.checkIssueFormat(body, config).ok).toBe(true);
  });

  test('直すと赤から緑に変わる', () => {
    const broken = GOOD_ISSUE.replace('## 完了条件\n- 赤と緑をテストで確かめた', '## 完了条件\n');
    expect(checks.checkIssueFormat(broken, config).ok).toBe(false);
    expect(checks.checkIssueFormat(GOOD_ISSUE, config).ok).toBe(true);
  });
});

describe('書き方チェック（PR）', () => {
  test('概要・変更内容・関連Issue があれば OK', () => {
    expect(checks.checkPrFormat(GOOD_PR, config)).toEqual({ ok: true, missing: [] });
  });

  test('今の PR テンプレート（Issue リンク・概要・見て欲しいポイント）で書いたものも OK', () => {
    const body = [
      '## Issue リンク / Link to Issue',
      'close #615',
      '### 概要',
      '入れる',
      '### 見て欲しいポイント',
      '- [ ] workflow の権限',
    ].join('\n');
    expect(checks.checkPrFormat(body, config).ok).toBe(true);
  });

  test('関連Issue が無い・テンプレートのままの「close #」は赤', () => {
    const r1 = checks.checkPrFormat(GOOD_PR.replace('Refs #615', ''), config);
    expect(r1.ok).toBe(false);
    expect(r1.missing.map((m) => m.name)).toEqual(['関連Issue']);
    const r2 = checks.checkPrFormat(GOOD_PR.replace('Refs #615', 'close #'), config);
    expect(r2.ok).toBe(false);
  });

  test('コメントの中だけにある Closes は数えない', () => {
    const body = GOOD_PR.replace('Refs #615', '<!-- Closes #1 -->');
    expect(checks.checkPrFormat(body, config).ok).toBe(false);
  });
});

describe('公開内容チェック', () => {
  const samples = {
    'private-key': join('-----BEGIN ', 'RSA PRIVATE', ' KEY-----'),
    'aws-access-key': join('AK', 'IA', 'ABCDEFGHIJKLMNOP'),
    'github-token': join('gh', 'p_', 'a'.repeat(36)),
    'slack-token': join('xo', 'xb-', '1234567890-abcdef'),
    'api-key-sk': join('s', 'k-', 'proj-', 'x'.repeat(24)),
    'google-api-key': join('AI', 'za', 'B'.repeat(35)),
    jwt: join('ey', 'J', 'a'.repeat(12), '.', 'ey', 'J', 'b'.repeat(12), '.', 'c'.repeat(12)),
    'secret-assignment': join('pass', 'word', '=', 'hunter2hunter2'),
    'db-connection-string': join('postgres', '://', 'user', ':', 'pw12345', '@', 'db.example.test/app'),
    'personal-email': join('taro.example', '@', 'gmail', '.com'),
  };

  for (const [id, sample] of Object.entries(samples)) {
    test(`作り物の例で赤になる: ${id}`, () => {
      const body = `ふつうの1行目\n${sample}\nふつうの3行目`;
      const r = checks.checkPublicContent(body, config);
      expect(r.ok).toBe(false);
      const hit = r.findings.find((f) => f.id === id);
      expect(hit).toBeDefined();
      expect(hit.lines).toEqual([2]);
      expect(hit.count).toBe(1);
    });
  }

  test('ふつうの文章は緑（issue #615 の本文の形、会社のメール、DB の話題だけ）', () => {
    const body = [
      GOOD_ISSUE,
      '連絡は info@example.co.jp へ。',
      'DB は D1 を使う。接続先は環境変数で渡す。',
      'パスワードは 1Password で管理する。',
    ].join('\n');
    expect(checks.checkPublicContent(body, config)).toEqual({ ok: true, findings: [] });
  });

  test('知らせる文には当たった文字そのものを書かない', () => {
    const sample = samples['aws-access-key'];
    const r = checks.checkPublicContent(`a\n${sample}`, config);
    const report = checks.formatReport('public', r, config);
    expect(report).toContain('aws-access-key');
    expect(report).toContain('1件、2行目');
    expect(report).not.toContain(sample);
    expect(report.startsWith(`${config.marker}:public\n`)).toBe(true);
  });
});

describe('対象外', () => {
  test('ボット・下書き PR・アラート系ラベルは書き方チェックを飛ばす', () => {
    expect(checks.shouldSkipFormat({ kind: 'pull_request', author: 'devin-ai-integration[bot]' }, config)).toBe(true);
    expect(checks.shouldSkipFormat({ kind: 'pull_request', author: 'kouiso', draft: true }, config)).toBe(true);
    expect(checks.shouldSkipFormat({ kind: 'issue', author: 'kouiso', labels: ['ci-failure'] }, config)).toBe(true);
    expect(checks.shouldSkipFormat({ kind: 'issue', author: 'kouiso', labels: ['feature'] }, config)).toBe(false);
  });

  test('結果の文は目印で始まる（同じコメントを更新するため）', () => {
    const ok = checks.formatReport('format', { ok: true, missing: [] }, config);
    expect(ok).toBe(`${config.marker}:format\n書き方チェック: OK`);
  });
});

describe('写しのずれ検査', () => {
  test('text-checks.cjs の中身が text-checks.source.json の sha256 と一致する', async () => {
    const { createHash } = await import('node:crypto');
    const { readFileSync } = await import('node:fs');
    const source = require('../text-checks.source.json');
    const file = require.resolve('./text-checks.cjs');
    const actual = createHash('sha256').update(readFileSync(file)).digest('hex');
    expect(actual).toBe(source.sha256);
  });
});

describe('非公開の規則（secret から読む）', () => {
  test('未設定なら空で、公開してよい形だけで判定する', () => {
    expect(checks.loadPrivateRules(undefined)).toEqual([]);
    expect(checks.loadPrivateRules('')).toEqual([]);
  });
  test('語が当たると赤、知らせる文に語も式も出ない', () => {
    const word = 'Zq' + 'xwordsample';
    const rules = checks.loadPrivateRules(JSON.stringify([word, { pattern: 'a.b+c', flags: 'i' }]));
    expect(rules.map((r) => r.id)).toEqual(['private-1', 'private-2']);
    const cfg = {
      ...config,
      publicContent: { ...config.publicContent, rules: config.publicContent.rules.concat(rules) },
    };
    const res = checks.checkPublicContent(`ふつうの文\nここに ${word.toLowerCase()} がある`, cfg);
    expect(res.ok).toBe(false);
    expect(res.findings.map((f) => f.id)).toEqual(['private-1']);
    const report = checks.formatReport('public', res, cfg);
    expect(report).not.toContain(word.toLowerCase());
    expect(report).not.toContain(word);
  });
  test('JSON が壊れていても中身はエラー文に出さない', () => {
    const bad = '[' + 'Zq' + 'xsecretword';
    expect(() => checks.loadPrivateRules(bad)).toThrow(/中身は表示しない/);
    try {
      checks.loadPrivateRules(bad);
    } catch (e) {
      expect(e.message).not.toContain('Zqxsecretword');
    }
  });
});
