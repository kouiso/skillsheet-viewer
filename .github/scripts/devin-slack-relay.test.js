const test = require('node:test');
const assert = require('node:assert/strict');
const { staleStatusAfterTries } = require('./devin-slack-relay.js');

// 無応答スイープ: 上限(3)未満では triggered を維持、到達で failed（再投稿しない）
test('stays triggered below STALE_TRIGGER_TRIES', () => {
  assert.equal(staleStatusAfterTries(1), 'triggered');
  assert.equal(staleStatusAfterTries(2), 'triggered');
});
test('transitions to failed at STALE_TRIGGER_TRIES, never pending', () => {
  assert.equal(staleStatusAfterTries(3), 'failed');
  assert.equal(staleStatusAfterTries(10), 'failed');
});
