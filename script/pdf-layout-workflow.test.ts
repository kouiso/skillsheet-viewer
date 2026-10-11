import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { PRINT_MIN_FONT_SIZE, PRINT_SIZE } from '@/component/pdf/print-token';
import type { Block } from '@/db/block';
import { filterVisibleProjectData } from '@/db/block';
import { classifyPeriod } from '@/db/process';

const workflow = readFileSync(new URL('../.github/workflows/pdf-layout-check.yml', import.meta.url), 'utf8');
const generator = fileURLToPath(new URL('./generate-pdf-layout-fixture.mjs', import.meta.url));
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function temp() {
  const dir = mkdtempSync(join(tmpdir(), 'pdf-workflow-'));
  dirs.push(dir);
  return dir;
}
function stepScript(name: string): string {
  const step = workflow.split(`      - name: ${name}\n`)[1]?.split('\n      - name:')[0];
  const script = step?.split('        run: |\n')[1];
  if (!script) throw new Error(`missing step ${name}`);
  return script
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');
}
function runStep(name: string, dir: string) {
  return spawnSync('/bin/bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', stepScript(name)], {
    env: { PATH: `${dir}:/usr/bin:/bin`, NODE_ENV: 'test', RUNNER_TEMP: dir },
    encoding: 'utf8',
  });
}

it('公開定期 CI は DB・owner・sheet 設定を参照せず従来の時刻・通知名・読取権限を維持する', () => {
  expect(workflow).toContain('name: PDF Layout Check\n');
  expect(workflow).toContain("cron: '0 21 * * *'");
  expect(workflow).toContain('workflow_dispatch:');
  expect(workflow).toContain('contents: read');
  expect(workflow).toContain('persist-credentials: false');
  expect(workflow).not.toMatch(
    /secrets\.|vars\.|DATABASE_URL|OWNER_ID|SHEET_ID|dump-block|upload-artifact|continue-on-error/,
  );
  // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions の式をそのまま検証する。
  expect(workflow).toContain('REAL_BLOCKS_JSON: ${{ runner.temp }}/blocks.json');
  expect(workflow.indexOf('- name: Generate synthetic blocks')).toBeLessThan(
    workflow.indexOf('- name: PDF layout check against synthetic data'),
  );
});

it.each([
  ['Generate synthetic blocks', 'node', 'pdf-fixture.log'],
  ['PDF layout check against synthetic data', 'pnpm', 'pdf-layout.log'],
])('%s は失敗ログを非公開に保ち元の終了コードを返す', (step, command, logfile) => {
  const dir = temp();
  writeFileSync(join(dir, command), '#!/bin/bash\necho PRIVATE_RESUME_TEXT\necho PRIVATE_ERROR >&2\nexit 7\n', {
    mode: 0o700,
  });
  const result = runStep(step, dir);
  expect(result.status).toBe(7);
  expect(result.stdout + result.stderr).not.toContain('PRIVATE');
  expect(result.stdout).toContain('exit 7');
  expect(readFileSync(join(dir, logfile), 'utf8')).toContain('PRIVATE_RESUME_TEXT');
  expect(statSync(join(dir, logfile)).mode & 0o777).toBe(0o600);
});

it('公開ログへの転送は既知規則の整数件数だけに限定する', () => {
  const dir = temp();
  writeFileSync(
    join(dir, 'pdf-layout.log'),
    [
      'PRIVATE_RESUME_TEXT',
      ' ✓ src/component/pdf/test.tsx PRIVATE_ERROR',
      ' FAIL src/component/pdf/test.tsx PRIVATE_ERROR',
      'PDF_LAYOUT_COUNTS secret=PRIVATE_ERROR',
      'PDF_LAYOUT_COUNTS overflow=0 PRIVATE_ERROR',
      'prefix PDF_LAYOUT_COUNTS overflow=0',
      'PDF_LAYOUT_COUNTS overflow=-1',
      '\u001b[32mPDF_LAYOUT_COUNTS early-break=0 overflow=2 page-spill=1\u001b[0m',
    ].join('\n'),
  );
  const result = runStep('Publish per-rule counts', dir);
  expect(result.status).toBe(0);
  expect(result.stdout.trim()).toBe('PDF_LAYOUT_COUNTS early-break=0 overflow=2 page-spill=1');
  expect(result.stderr).toBe('');
});

it('生成前の失敗でも件数公開・cleanup は成功し、未作成ファイルに依存しない', () => {
  const dir = temp();
  expect(runStep('Publish per-rule counts', dir).status).toBe(0);
  expect(runStep('Remove synthetic inputs and logs', dir).status).toBe(0);
  expect(workflow).toContain('- name: Remove synthetic inputs and logs\n        if: always()');
  for (const name of ['blocks.json', 'blocks.evidence', 'pdf-fixture.log', 'pdf-layout.log']) {
    writeFileSync(join(dir, name), 'SYNTHETIC_ONLY');
  }
  writeFileSync(join(dir, 'unrelated.txt'), 'KEEP');
  expect(runStep('Remove synthetic inputs and logs', dir).status).toBe(0);
  for (const name of ['blocks.json', 'blocks.evidence', 'pdf-fixture.log', 'pdf-layout.log']) {
    expect(existsSync(join(dir, name))).toBe(false);
  }
  expect(readFileSync(join(dir, 'unrelated.txt'), 'utf8')).toBe('KEEP');
});

it('外部入力を読まない生成器が決定論的な日本語・長段落・表示フィルタ fixture と hash を生成する', () => {
  const dir = temp();
  // これは新規の合成ダミー。実環境ファイルを読む必要がないことを独立した cwd で検証する。
  writeFileSync(join(dir, '.env'), 'DATABASE_URL=DO_NOT_READ_SYNTHETIC_CANARY');
  const outputs: string[] = [];
  for (const suffix of ['a', 'b']) {
    const out = join(dir, `blocks-${suffix}.json`);
    const evidence = join(dir, `evidence-${suffix}`);
    const result = spawnSync(process.execPath, [generator, out, evidence], {
      cwd: dir,
      env: { NODE_ENV: 'test', PATH: '/usr/bin:/bin', DATABASE_URL: 'DO_NOT_READ_SYNTHETIC_CANARY' },
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).toBe('');
    const json = readFileSync(out, 'utf8');
    outputs.push(json);
    const blocks = JSON.parse(json) as Block[];
    expect(blocks).toHaveLength(14);
    expect(blocks.filter((block) => block.type === 'skills')).toHaveLength(12);
    const project = blocks.find((block) => block.type === 'project');
    if (project?.type !== 'project') throw new Error('project fixture missing');
    expect(project.data.companies).toHaveLength(3);
    expect(project.data.items).toHaveLength(5);
    const visible = filterVisibleProjectData(project.data);
    expect(visible.companies).toHaveLength(2);
    expect(visible.items).toHaveLength(3);
    expect(visible.items.map((item) => item.title).join('')).not.toContain('非表示');
    expect(visible.items[0].duties.length).toBeGreaterThan(4000);
    expect(visible.items[0].duties).not.toContain('\n');
    expect(visible.items[0].tech.tools[0].length).toBeGreaterThan(40);
    expect(json).not.toContain('DO_NOT_READ_SYNTHETIC_CANARY');
    const hash = createHash('sha256').update(json).digest('hex');
    expect(readFileSync(evidence, 'utf8')).toBe(
      `PDF_SYNTHETIC_FIXTURE source=synthetic sha256=${hash} blocks=14 companies=3 projects=5 visibleCompanies=2 visibleProjects=3\n`,
    );
    expect(statSync(out).mode & 0o777).toBe(0o600);
    expect(statSync(evidence).mode & 0o777).toBe(0o600);
    // 実際の workflow 抽出器も通す。
    writeFileSync(join(dir, 'blocks.evidence'), readFileSync(evidence));
    writeFileSync(join(dir, 'blocks.json'), json);
    expect(runStep('Record synthetic evidence', dir).stdout).toBe(readFileSync(evidence, 'utf8'));
  }
  expect(outputs[0]).toBe(outputs[1]);
  expect(PRINT_MIN_FONT_SIZE).toBe(11);
  expect([PRINT_SIZE.pageWidth, PRINT_SIZE.pageHeight]).toEqual([595, 842]);
  const source = readFileSync(generator, 'utf8');
  expect([...source.matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => match[1])).toEqual(['node:crypto', 'node:fs']);
  expect(source).not.toMatch(/process\.env|readFile|fetch\(|import\(/);
});

it('生成器は既存ファイルを上書きせず例外本文や出力先を漏らさない', () => {
  const dir = temp();
  const out = join(dir, 'PRIVATE_PATH.json');
  writeFileSync(out, 'KEEP');
  const result = spawnSync(process.execPath, [generator, out, join(dir, 'evidence')], {
    encoding: 'utf8',
    env: { NODE_ENV: 'test' },
  });
  expect(result.status).toBe(1);
  expect(readFileSync(out, 'utf8')).toBe('KEEP');
  expect(result.stdout + result.stderr).not.toContain('PRIVATE_PATH');
  expect(result.stderr.trim()).toBe('Synthetic fixture generation failed.');
});

it('evidence の本文・host・識別子を装った行を公開しない', () => {
  const dir = temp();
  writeFileSync(
    join(dir, 'blocks.evidence'),
    'host=PRIVATE_HOST\nPDF_SYNTHETIC_FIXTURE source=synthetic sha256=PRIVATE_HASH\n',
  );
  const result = runStep('Record synthetic evidence', dir);
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).not.toContain('PRIVATE');
});

it('少数スキルと折返しタグの合法入力を再現用 variant として保持する', () => {
  const dir = temp();
  const out = join(dir, 'sparse.json');
  const result = spawnSync(process.execPath, [generator, out, join(dir, 'sparse.evidence'), '--sparse-skills'], {
    env: { NODE_ENV: 'test' },
    encoding: 'utf8',
  });
  expect(result.status).toBe(0);
  const blocks = JSON.parse(readFileSync(out, 'utf8')) as Block[];
  expect(blocks).toHaveLength(3);
  const skills = blocks.find((block) => block.type === 'skills');
  if (skills?.type !== 'skills') throw new Error('sparse skills missing');
  expect(skills.data.skills.map((skill) => skill.name)).toEqual([
    'TypeScript',
    'SyntheticObservatoryTelemetryVisualizationToolkit',
    '日本語星図表示ライブラリ',
  ]);
  const projects = blocks.find((block) => block.type === 'project');
  if (projects?.type !== 'project') throw new Error('sparse projects missing');
  for (const item of projects.data.items) expect(classifyPeriod(item.period, 24321).status).toBe('valid');
  // ASCII hyphen の原文保持を「標準形式の期間」と誤認して fixture に入れない。
  expect(classifyPeriod('2026.01 - 2026.06', 24321).status).toBe('unknown');
});

it.each([
  'input-change',
  'record-hash',
  'duplicate-record',
  'missing-input',
] as const)('公開前の hash 突合は %s を検出し、不一致の evidence を公開しない', (mutation) => {
  const dir = temp();
  const out = join(dir, 'blocks.json');
  const evidence = join(dir, 'blocks.evidence');
  expect(
    spawnSync(process.execPath, [generator, out, evidence], {
      env: { NODE_ENV: 'test' },
      encoding: 'utf8',
    }).status,
  ).toBe(0);
  const record = readFileSync(evidence, 'utf8');
  if (mutation === 'input-change') writeFileSync(out, 'SYNTHETIC_INPUT_CHANGED');
  if (mutation === 'record-hash')
    writeFileSync(evidence, record.replace(/sha256=[0-9a-f]{64}/, `sha256=${'0'.repeat(64)}`));
  if (mutation === 'duplicate-record') writeFileSync(evidence, record + record);
  if (mutation === 'missing-input') rmSync(out);
  const result = runStep('Record synthetic evidence', dir);
  expect(result.status).toBe(1);
  expect(result.stdout).toContain('::error::Synthetic');
  expect(result.stdout + result.stderr).not.toContain('PDF_SYNTHETIC_FIXTURE');
  expect(result.stdout + result.stderr).not.toContain('SYNTHETIC_INPUT_CHANGED');
});

it('会社と案件を増減した生成器でも evidence 件数は実ブロックから算出する', () => {
  const dir = temp();
  const anchor = 'const [out, evidence, variant, ...extra] = process.argv.slice(2);';
  const source = readFileSync(generator, 'utf8');
  expect(source).toContain(anchor);
  // コピーした公開生成器へ合成の構造変化を加え、定数を書き出す実装では通らないことを確認する。
  const mutation = `
const data = blocks.find(block => block.type === 'project').data;
data.companies[0].hidden = true;
data.companies.push({ ...data.companies[0], id: 'extra-company', hidden: false });
data.items.push({ ...data.items[0], id: 'extra-project', companyId: 'extra-company' });
`;
  const mutated = join(dir, 'mutated-generator.mjs');
  writeFileSync(mutated, source.replace(anchor, mutation + anchor));
  const out = join(dir, 'mutated.json');
  const evidence = join(dir, 'mutated.evidence');
  const result = spawnSync(process.execPath, [mutated, out, evidence], {
    env: { NODE_ENV: 'test' },
    encoding: 'utf8',
  });
  expect(result.status).toBe(0);
  const blocks = JSON.parse(readFileSync(out, 'utf8')) as Block[];
  const data = blocks.find((block) => block.type === 'project');
  if (data?.type !== 'project') throw new Error('mutated project fixture missing');
  expect(data.data.companies).toHaveLength(4);
  expect(data.data.items).toHaveLength(6);
  expect(filterVisibleProjectData(data.data).companies).toHaveLength(2);
  expect(filterVisibleProjectData(data.data).items).toHaveLength(2);
  expect(readFileSync(evidence, 'utf8')).toMatch(
    /blocks=14 companies=4 projects=6 visibleCompanies=2 visibleProjects=2\n$/,
  );
});
