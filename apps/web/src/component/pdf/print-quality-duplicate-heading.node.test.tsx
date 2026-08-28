/**
 * 見出し重複検査が、実際に起きた欠陥（p8→p9, p29→p30 の「続き」抜け）を検出することを証明する。
 *
 * **凍結済みの PDF ファイルそのもの**（`skillsheet-new-design.pdf`）を直接検査する。
 * blocks から都度レンダーし直すと、並行編集中の print-document.tsx / company-heading.tsx /
 * print-tokens.ts の変更でページ割りが変わり、「p8→p9 で再現するか」の検証にならない
 * （実測: 再レンダーすると別の案件・別ページ番号で同じ壊れ方が出た — 検査自体は機能して
 * いるが、レビューで指摘された p8/p29 の再現確認としては PDF ファイル直読みが要る）。
 *
 * 実データ（本番 Neon の blocks テーブル）は個人情報のためリポジトリへコミットできない。
 * `.evidence/pdf-print-redesign/` 配下はローカルの調査証跡（gitignore 相当で除外済み、
 * CI には存在しない）。存在するときだけ実行する — CI 必須の経路ではなく、検査自体の証明。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Block } from '@skillsheet/db/blocks';
import { describe, expect, it } from 'vitest';
import { runDuplicateHeadingChecks } from './print-quality-duplicate-heading';
import { extractQualityPages } from './print-quality-extract.node';
import { buildPrintViewModel } from './print-view-model';

// レビューで見つかった、現行の壊れた PDF そのもの（実データ由来・ローカル限定）。
const KNOWN_BAD_PDF = path.resolve(
  process.cwd(),
  '..',
  '..',
  '.evidence',
  'pdf-print-redesign',
  'skillsheet-new-design.pdf',
);
// 上の PDF を生成した元データ。タイトル一覧を得るためだけに使う
// （`buildPrintViewModel` は純粋関数で、並行編集中のファイルに依存しない）。
const KNOWN_BAD_BLOCKS = path.resolve(
  process.cwd(),
  '..',
  '..',
  '.evidence',
  'pdf-print-redesign',
  'company-grouping',
  'real-blocks.json',
);

describe('見出し重複検査が「続き」抜けの実例を検出する', () => {
  it.skipIf(!existsSync(KNOWN_BAD_PDF) || !existsSync(KNOWN_BAD_BLOCKS))(
    '現行の壊れた PDF で「続き」を伴わない見出しの重複を検出する',
    async () => {
      const blocks = JSON.parse(readFileSync(KNOWN_BAD_BLOCKS, 'utf-8')) as Block[];
      const vm = buildPrintViewModel('エンジニアスキルシート', blocks);
      const titles = vm.companies.flatMap((c) => c.projects.map((p) => p.title));

      const buffer = readFileSync(KNOWN_BAD_PDF);
      const pages = await extractQualityPages(buffer);

      const findings = runDuplicateHeadingChecks(pages, titles);
      console.log(`[duplicate-heading] pages=${pages.length} findings=${findings.length}`);
      for (const f of findings) console.log(`[duplicate-heading] p${f.page} ${f.detail}`);

      // 検査が何も見ていないなら、この行が落ちる（既知の欠陥が実在する状態での自己診断）。
      expect(findings.length).toBeGreaterThan(0);
      // レビューで指摘された 2 件（p8→p9, p29→p30）がどちらも拾えていることを固定する。
      expect(findings.some((f) => f.page === 9)).toBe(true);
      expect(findings.some((f) => f.page === 30)).toBe(true);
    },
    60_000,
  );
});
