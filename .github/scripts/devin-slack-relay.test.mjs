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

// ---- sweep() を実際に走らせる ----
// Devin が無言のまま sweep（6時間ごと）が繰り返されたとき、上限で failed になり、
// Slack へ再投稿せず、トリガーラベルを外すことを、GitHub と Slack を差し替えて確かめる。
const { sweep } = require('./devin-slack-relay.cjs');

function fakeGithub({ labels, commentBody }) {
  const state = { labels: new Set(labels), comments: [{ id: 1, user: { type: 'Bot' }, body: commentBody }] };
  const issue = {
    number: 7,
    title: '合成の issue',
    html_url: 'https://example.test/issues/7',
    labels: [],
    pull_request: undefined,
  };
  const github = {
    paginate: async (fn) =>
      fn === github.rest.issues.listForRepo
        ? [{ ...issue, labels: [...state.labels].map((name) => ({ name })) }]
        : state.comments,
    rest: {
      issues: {
        listForRepo: () => {},
        listComments: () => {},
        createComment: async ({ body }) =>
          state.comments.push({ id: state.comments.length + 1, user: { type: 'Bot' }, body }),
        updateComment: async ({ comment_id, body }) => {
          state.comments.find((c) => c.id === comment_id).body = body;
        },
        addLabels: async ({ labels: added }) => {
          for (const name of added) state.labels.add(name);
        },
        removeLabel: async ({ name }) => {
          state.labels.delete(name);
        },
        createLabel: async () => {},
      },
    },
  };
  return { github, state };
}

test('sweep: 無言が上限まで続くと failed になり、再投稿せずトリガーラベルを外す', async () => {
  // 実行環境にラベル名の上書き（TRIGGER_LABEL など）があっても結果が変わらないよう、明示して使う。
  const testEnv = {
    SLACK_BOT_TOKEN: 'x',
    SLACK_CHANNEL_ID: 'C1',
    DEVIN_USER_ID: 'U1',
    TRIGGER_LABEL: 'for-devin',
    QUEUE_LABEL: 'devin-queued',
    WAITING_LABEL: 'devin-waiting',
    FAILED_LABEL: 'devin-failed',
  };
  const envBefore = { ...process.env };
  Object.assign(process.env, testEnv);
  const posted = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('chat.postMessage')) posted.push(options.body);
    // 親メッセージだけで Devin の返信が無い（無言）スレッド
    return { json: async () => ({ ok: true, messages: [{ text: '親' }] }) };
  };
  try {
    const { github, state } = fakeGithub({
      labels: ['for-devin'],
      commentBody:
        '- Slack スレッド: なし\n- Devin セッション: 未起動\n<!-- devin-slack-triggered ts=1.1 status=triggered tries=0 -->',
    });
    const context = { repo: { owner: 'o', repo: 'r' } };
    const core = { info() {}, warning() {}, setOutput() {} };
    const statusAfter = () => /status=(\w+)/.exec(state.comments[0].body)[1];

    for (let sweepCount = 1; sweepCount < STALE_TRIGGER_TRIES; sweepCount++) {
      await sweep({ github, context, core });
      expect(statusAfter()).toBe('triggered');
      expect(state.labels.has('for-devin')).toBe(true);
    }
    await sweep({ github, context, core });
    expect(statusAfter()).toBe('failed');
    expect(state.labels.has('devin-failed')).toBe(true);
    expect(state.labels.has('for-devin')).toBe(false);
    expect(posted).toEqual([]);

    // failed になったあとは、トリガーラベルが無いので sweep が何度回っても再投稿せず、状態も変わらない。
    for (let extra = 0; extra < 3; extra++) await sweep({ github, context, core });
    expect(statusAfter()).toBe('failed');
    expect([...state.labels]).toEqual(['devin-failed']);
    expect(posted).toEqual([]);
  } finally {
    globalThis.fetch = realFetch;
    for (const key of Object.keys(testEnv)) {
      if (envBefore[key] === undefined) delete process.env[key];
      else process.env[key] = envBefore[key];
    }
  }
});
