// vitest.shared.ts が globals: true のため、test / expect は import せずに使える。
// この workflow 用スクリプトは CJS のまま、jsdom 側の vitest 実行に拾われて検証される。
const { staleStatusAfterTries } = require('./devin-slack-relay.cjs');

// 無応答スイープ: 上限(3)未満では triggered を維持、到達で failed（再投稿しない）
test('stays triggered below STALE_TRIGGER_TRIES', () => {
  expect(staleStatusAfterTries(1)).toBe('triggered');
  expect(staleStatusAfterTries(2)).toBe('triggered');
});
test('transitions to failed at STALE_TRIGGER_TRIES, never pending', () => {
  expect(staleStatusAfterTries(3)).toBe('failed');
  expect(staleStatusAfterTries(10)).toBe('failed');
});
