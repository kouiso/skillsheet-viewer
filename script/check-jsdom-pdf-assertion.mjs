#!/usr/bin/env node
/**
 * jsdom 環境で走るテスト（*.test.tsx / *.spec.tsx のうち *.node.test.tsx 以外）に、
 * PDF フォント・グリフ・描画に関する主張を書かないことを機械的に確認する。
 *
 * jsdom では @react-pdf/renderer の renderToBuffer / Font 操作が別 realm の Uint8Array
 * 判定で壊れるため、これらの検証は *.node.test.tsx（vitest.config.pdf.ts / node）側で
 * 行う決まりとする。
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { cwd } from 'node:process';

const ROOT = cwd();
const TARGET_DIR = join(ROOT, 'src');

const FORBIDDEN_PATTERNS = [
  { pattern: /from\s+['"]@react-pdf\/renderer['"]/, reason: '@react-pdf/renderer を直接 import している' },
  { pattern: /from\s+['"]pdfjs-dist['"]/, reason: 'pdfjs-dist を直接 import している' },
  { pattern: /renderToBuffer\s*\(/, reason: 'renderToBuffer を直接呼んでいる' },
  { pattern: /Font\.register\s*\(/, reason: 'Font.register を直接呼んでいる' },
];

/** *.test.tsx / *.spec.tsx から *.node.test.tsx / *.node.spec.tsx を除く */
function isJsdomTestFile(fileName) {
  if (fileName.endsWith('.node.test.tsx') || fileName.endsWith('.node.spec.tsx')) return false;
  return fileName.endsWith('.test.tsx') || fileName.endsWith('.spec.tsx');
}

async function* walk(dir) {
  const entries = await readdir(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const s = await stat(fullPath);
    if (s.isDirectory()) {
      yield* walk(fullPath);
    } else if (s.isFile() && isJsdomTestFile(entry)) {
      yield fullPath;
    }
  }
}

let exitCode = 0;
const violations = [];

for await (const filePath of walk(TARGET_DIR)) {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('//')) continue;
    for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({ file: relative(ROOT, filePath), line: i + 1, reason });
        exitCode = 1;
      }
    }
  }
}

if (violations.length > 0) {
  console.error('jsdom テストに PDF フォント・グリフ・描画の主張が含まれています:');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} ${v.reason}`);
  }
  console.error('上記は *.node.test.tsx（vitest.config.pdf.ts / node 環境）側に移動してください。');
} else {
  console.log('jsdom テストに PDF フォント・グリフ・描画の主張は見つかりませんでした。');
}

process.exit(exitCode);
