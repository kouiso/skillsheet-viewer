// workflow 用のリレーは CJS（`require` で読む）のまま。vitest は CJS のテストファイルでは
// グローバルの test / expect を登録できず「No test suite found」になるため、テスト側を ESM にして
// createRequire で CJS を読む。
import { createRequire } from 'node:module';
import { expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const { staleStatusAfterTries, STALE_TRIGGER_TRIES } = require('./devin-slack-relay.cjs');

// 無応答スイープ: 上限未満では triggered を維持し、到達で failed（自動再投稿しない）。
test('stays triggered below STALE_TRIGGER_TRIES', () => {
  expect(staleStatusAfterTries(0)).toBe('triggered');
  expect(staleStatusAfterTries(STALE_TRIGGER_TRIES - 1)).toBe('triggered');
});
test('transitions to failed at STALE_TRIGGER_TRIES, never pending', () => {
  expect(staleStatusAfterTries(STALE_TRIGGER_TRIES)).toBe('failed');
  expect(staleStatusAfterTries(STALE_TRIGGER_TRIES + 10)).toBe('failed');
});
