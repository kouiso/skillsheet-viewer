import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Devin Slack 起動リレー（.github/scripts/devin-slack-relay.cjs）の状態遷移を、
// 偽の GitHub と偽の Slack（fetch の差し替え）で動かして確かめる。
// リレーは Devin セッションを消費する外部副作用を持つので、重複投稿・無限再投稿・偽マーカーの信頼が
// 起きないことを、CI の外から実コードで固定する。

type RelayArgs = { github: unknown; context: unknown; core: unknown };
const relay = createRequire(import.meta.url)('../.github/scripts/devin-slack-relay.cjs') as {
  dispatch: (args: RelayArgs) => Promise<void>;
  verify: (args: RelayArgs) => Promise<void>;
  sweep: (args: RelayArgs) => Promise<void>;
};

type Comment = { id: number; body: string; user: { type: string } };
type IssueState = { number: number; title: string; labels: Set<string>; comments: Comment[]; listFails?: boolean };
type SlackReply = { text: string; bot_id?: string };

class World {
  issues = new Map<number, IssueState>();
  posts: { text: string; thread_ts?: string }[] = [];
  replies: SlackReply[] = [];
  repliesError: string | null = null;
  // 投稿の失敗を呼び出しごとに決める。undefined なら成功。
  postError: (call: { text: string; thread_ts?: string }) => string | undefined = () => undefined;
  warnings: string[] = [];
  outputs: Record<string, string> = {};
  private nextTs = 1;
  private nextCommentId = 1;

  addIssue(number: number, labels: string[], title = `title ${number}`, marker?: string, markerUser = 'Bot') {
    const issue: IssueState = { number, title, labels: new Set(labels), comments: [] };
    if (marker) issue.comments.push({ id: this.nextCommentId++, body: marker, user: { type: markerUser } });
    this.issues.set(number, issue);
    return issue;
  }

  get(number: number): IssueState {
    const issue = this.issues.get(number);
    if (!issue) throw new Error(`no issue ${number}`);
    return issue;
  }

  marker(number: number): { ts: string; status: string; tries: number } | null {
    const body = this.get(number)
      .comments.filter((c) => c.user.type === 'Bot')
      .map((c) => c.body)
      .find((b) => b.includes('devin-slack-triggered'));
    const m = body && /ts=(\S+) status=(\S+) tries=(\d+)/.exec(body);
    return m ? { ts: m[1], status: m[2], tries: Number(m[3]) } : null;
  }

  statusBody(number: number): string {
    return this.get(number).comments.find((c) => c.body.includes('devin-slack-triggered'))?.body ?? '';
  }

  fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
    if (url.includes('chat.postMessage')) {
      const body = JSON.parse(String(init?.body)) as { text: string; thread_ts?: string };
      const error = this.postError(body);
      if (error) return json({ ok: false, error });
      this.posts.push(body);
      return json({ ok: true, ts: `100.${String(this.nextTs++).padStart(3, '0')}` });
    }
    if (url.includes('chat.getPermalink')) {
      return json({
        ok: true,
        permalink: `https://slack.test/archives/C1/p${new URL(url).searchParams.get('message_ts') ?? ''}`,
      });
    }
    if (url.includes('conversations.replies')) {
      if (this.repliesError) return json({ ok: false, error: this.repliesError });
      return json({ ok: true, messages: [{ text: 'parent' }, ...this.replies] });
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  github = {
    paginate: async (
      fn: (p: Record<string, unknown>) => Promise<{ data: unknown[] }>,
      params: Record<string, unknown>,
    ) => (await fn(params)).data,
    graphql: async () => {
      throw new Error('graphql must not be called without DEVIN_PROJECT_NUMBER');
    },
    rest: {
      issues: {
        listForRepo: async () => ({
          data: [...this.issues.values()].map((i) => ({
            number: i.number,
            title: i.title,
            html_url: `https://github.test/issues/${i.number}`,
            labels: [...i.labels].map((name) => ({ name })),
          })),
        }),
        get: async ({ issue_number }: { issue_number: number }) => ({
          data: { labels: [...this.get(issue_number).labels].map((name) => ({ name })) },
        }),
        listComments: async ({ issue_number }: { issue_number: number }) => {
          const issue = this.get(issue_number);
          if (issue.listFails) throw new Error('boom');
          return { data: issue.comments };
        },
        createComment: async ({ issue_number, body }: { issue_number: number; body: string }) => {
          this.get(issue_number).comments.push({ id: this.nextCommentId++, body, user: { type: 'Bot' } });
        },
        updateComment: async ({ comment_id, body }: { comment_id: number; body: string }) => {
          for (const issue of this.issues.values()) {
            const c = issue.comments.find((x) => x.id === comment_id);
            if (c) c.body = body;
          }
        },
        createLabel: async () => {
          throw Object.assign(new Error('exists'), { status: 422 });
        },
        getLabel: async ({ name }: { name: string }) => ({ data: { name, description: '' } }),
        updateLabel: async () => undefined,
        addLabels: async ({ issue_number, labels }: { issue_number: number; labels: string[] }) => {
          for (const l of labels) this.get(issue_number).labels.add(l);
        },
        removeLabel: async ({ issue_number, name }: { issue_number: number; name: string }) => {
          if (!this.get(issue_number).labels.delete(name)) throw Object.assign(new Error('not found'), { status: 404 });
        },
      },
    },
  };

  core = {
    info: () => undefined,
    warning: (message: string) => {
      this.warnings.push(message);
    },
    setOutput: (key: string, value: string) => {
      this.outputs[key] = value;
    },
  };

  context(issueNumber?: number, label?: string) {
    const issue = issueNumber === undefined ? undefined : this.get(issueNumber);
    return {
      repo: { owner: 'o', repo: 'r' },
      payload: issue
        ? {
            issue: { number: issue.number, title: issue.title, html_url: `https://github.test/issues/${issue.number}` },
            label: { name: label },
          }
        : {},
    };
  }

  args(issueNumber?: number, label?: string): RelayArgs {
    return { github: this.github, context: this.context(issueNumber, label), core: this.core };
  }
}

const marker = (ts: string, status: string, tries = 0) =>
  `:robot_face: Devin 起動リレー\n- Slack スレッド: なし\n- Devin セッション: 未起動\n<!-- devin-slack-triggered ts=${ts} status=${status} tries=${tries} -->`;
const SESSION = 'https://app.devin.ai/sessions/abc123def456';

let world: World;
beforeEach(() => {
  world = new World();
  vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-test');
  vi.stubEnv('SLACK_CHANNEL_ID', 'C1');
  vi.stubEnv('DEVIN_USER_ID', 'U_DEVIN');
  // 呼び出し側の環境に左右されないよう、リレーの設定変数はすべて空にして既定値を使わせる
  for (const name of [
    'DEVIN_MODE',
    'TRIGGER_LABEL',
    'QUEUE_LABEL',
    'WAITING_LABEL',
    'FAILED_LABEL',
    'DEVIN_PROJECT_NUMBER',
    'DEVIN_FIELD_NAME',
  ]) {
    vi.stubEnv(name, '');
  }
  vi.stubGlobal('fetch', world.fetch);
  // sweep の Slack レート対策の 1 秒待ちを飛ばす
  vi.stubGlobal('setTimeout', (fn: () => void) => {
    fn();
    return 0;
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('dispatch（labeled イベント）', () => {
  it('trigger ラベルで Slack に Devin 宛の !megaplan を投稿し、triggered を記録する', async () => {
    world.addIssue(1, ['for-devin'], 'タイトル');
    await relay.dispatch(world.args(1, 'for-devin'));
    expect(world.posts).toHaveLength(1);
    expect(world.posts[0].text).toMatch(/^<@U_DEVIN>\n!megaplan\n/);
    expect(world.marker(1)).toMatchObject({ status: 'triggered', tries: 0 });
    expect(world.outputs.thread_ts).toBe(world.marker(1)?.ts);
  });

  it('title の山括弧は全角にして、Slack のメンションや リンクを意図せず作らない', async () => {
    world.addIssue(1, ['for-devin'], '<!channel> と <@U1>');
    await relay.dispatch(world.args(1, 'for-devin'));
    expect(world.posts[0].text).not.toContain('<!channel>');
    expect(world.posts[0].text).toContain('＜!channel＞');
  });

  it('既に triggered なら二重に投稿しない', async () => {
    world.addIssue(1, ['for-devin'], 't', marker('100.001', 'triggered'));
    await relay.dispatch(world.args(1, 'for-devin'));
    expect(world.posts).toHaveLength(0);
    expect(world.outputs.skipped).toBe('true');
  });

  it('Slack が失敗したら pending にして waiting ラベルへ回し、trigger ラベルを外す', async () => {
    world.addIssue(1, ['for-devin']);
    world.postError = () => 'ratelimited';
    await relay.dispatch(world.args(1, 'for-devin'));
    expect(world.marker(1)).toMatchObject({ status: 'pending' });
    expect(world.get(1).labels.has('devin-waiting')).toBe(true);
    expect(world.get(1).labels.has('for-devin')).toBe(false);
    expect(world.statusBody(1)).toContain('ratelimited');
  });

  it('元のスレッドが消えていたら、新しいスレッドに投稿し直す', async () => {
    world.addIssue(1, ['for-devin'], 't', marker('100.001', 'pending', 1));
    world.postError = (call) => (call.thread_ts ? 'thread_not_found' : undefined);
    await relay.dispatch(world.args(1, 'for-devin'));
    expect(world.posts).toHaveLength(1);
    expect(world.posts[0].thread_ts).toBeUndefined();
    expect(world.marker(1)).toMatchObject({ status: 'triggered' });
  });

  it('devin-queued ラベルは投稿せず、キュー済みにするだけ', async () => {
    world.addIssue(1, ['devin-queued']);
    await relay.dispatch(world.args(1, 'devin-queued'));
    expect(world.posts).toHaveLength(0);
    expect(world.marker(1)).toMatchObject({ status: 'queued' });
  });
});

describe('verify（投稿直後の確認）', () => {
  it('セッション URL があれば done にして trigger ラベルを外す', async () => {
    world.addIssue(1, ['for-devin'], 't', marker('100.001', 'triggered'));
    world.replies = [{ text: `started ${SESSION}`, bot_id: 'B1' }];
    await relay.verify(world.args(1));
    expect(world.marker(1)).toMatchObject({ status: 'done' });
    expect(world.statusBody(1)).toContain(SESSION);
    expect(world.get(1).labels.has('for-devin')).toBe(false);
  });

  it('bot の失敗返信は pending にする（再投稿の対象になる）', async () => {
    world.addIssue(1, ['for-devin'], 't', marker('100.001', 'triggered'));
    world.replies = [{ text: 'Failed to create Devin session', bot_id: 'B1' }];
    await relay.verify(world.args(1));
    expect(world.marker(1)).toMatchObject({ status: 'pending' });
  });

  it('人間の返信に失敗の語句があっても失敗にしない', async () => {
    world.addIssue(1, ['for-devin'], 't', marker('100.001', 'triggered'));
    world.replies = [{ text: 'Failed to start って書いてあるけど気にしないで' }];
    await relay.verify(world.args(1));
    expect(world.marker(1)).toMatchObject({ status: 'triggered' });
  });

  it('自分の起動メッセージ（!megaplan を含む）に含まれる語句は失敗にしない', async () => {
    world.addIssue(1, ['for-devin'], 't', marker('100.001', 'triggered'));
    world.replies = [{ text: '<@U_DEVIN>\n!megaplan\nFailed to start を直す', bot_id: 'B1' }];
    await relay.verify(world.args(1));
    expect(world.marker(1)).toMatchObject({ status: 'triggered' });
  });

  it('セッション URL と古い失敗文が混在したら成功を優先する', async () => {
    world.addIssue(1, ['for-devin'], 't', marker('100.001', 'triggered'));
    world.replies = [
      { text: 'Failed to create Devin', bot_id: 'B1' },
      { text: SESSION, bot_id: 'B1' },
    ];
    await relay.verify(world.args(1));
    expect(world.marker(1)).toMatchObject({ status: 'done' });
  });

  it('Slack を読めない時は何も変えない（sweep が拾う）', async () => {
    world.addIssue(1, ['for-devin'], 't', marker('100.001', 'triggered'));
    world.repliesError = 'ratelimited';
    await relay.verify(world.args(1));
    expect(world.marker(1)).toMatchObject({ status: 'triggered' });
    expect(world.warnings.join()).toContain('ratelimited');
  });
});

describe('sweep（定期実行）', () => {
  it('キュー済みの issue を起動し、trigger ラベルを付ける', async () => {
    world.addIssue(1, ['devin-queued'], 't', marker('-', 'queued'));
    await relay.sweep(world.args());
    expect(world.posts).toHaveLength(1);
    expect(world.marker(1)).toMatchObject({ status: 'triggered' });
    expect(world.get(1).labels.has('for-devin')).toBe(true);
    expect(world.get(1).labels.has('devin-queued')).toBe(false);
  });

  it('起動済みのキューは、もう一度投稿しない', async () => {
    world.addIssue(1, ['devin-queued'], 't', marker('100.001', 'triggered'));
    await relay.sweep(world.args());
    expect(world.posts).toHaveLength(0);
  });

  it('対象ラベルが無い issue はコメントも読まない', async () => {
    const issue = world.addIssue(1, ['bug']);
    issue.listFails = true;
    await relay.sweep(world.args());
    expect(world.warnings).toEqual([]);
  });

  it('Devin が無言のまま 4 回目の巡回で failed にし、自動では再投稿しない', async () => {
    world.addIssue(1, ['for-devin'], 't', marker('100.001', 'triggered'));
    for (const expected of [1, 2, 3]) {
      await relay.sweep(world.args());
      expect(world.marker(1)).toMatchObject({ status: 'triggered', tries: expected });
    }
    await relay.sweep(world.args());
    expect(world.marker(1)).toMatchObject({ status: 'failed', tries: 4 });
    expect(world.get(1).labels.has('devin-failed')).toBe(true);
    expect(world.get(1).labels.has('for-devin')).toBe(false);
    expect(world.posts).toHaveLength(0);
    // failed になった後は、巡回しても何も起きない
    await relay.sweep(world.args());
    expect(world.posts).toHaveLength(0);
  });

  it('遅れて来たセッション URL を done として回収する', async () => {
    world.addIssue(1, ['for-devin'], 't', marker('100.001', 'triggered', 2));
    world.replies = [{ text: SESSION, bot_id: 'B1' }];
    await relay.sweep(world.args());
    expect(world.marker(1)).toMatchObject({ status: 'done' });
    expect(world.get(1).labels.has('for-devin')).toBe(false);
  });

  it('スレッドが消えていたら pending に降格する（次回、新スレッドで再投稿される）', async () => {
    world.addIssue(1, ['for-devin'], 't', marker('100.001', 'triggered'));
    world.repliesError = 'thread_not_found';
    await relay.sweep(world.args());
    expect(world.marker(1)).toMatchObject({ status: 'pending', ts: '-' });
    expect(world.posts).toHaveLength(0);
  });

  it('pending を、同じスレッドへ再投稿して tries を進める', async () => {
    world.addIssue(1, ['devin-waiting'], 't', marker('100.001', 'pending', 1));
    await relay.sweep(world.args());
    expect(world.posts).toHaveLength(1);
    expect(world.posts[0].thread_ts).toBe('100.001');
    expect(world.marker(1)).toMatchObject({ status: 'pending', tries: 2 });
  });

  it('再投稿の上限（3 回）に達したら failed にして、それ以上投稿しない', async () => {
    world.addIssue(1, ['devin-waiting'], 't', marker('100.001', 'pending', 3));
    await relay.sweep(world.args());
    expect(world.posts).toHaveLength(0);
    expect(world.marker(1)).toMatchObject({ status: 'failed', tries: 3 });
    expect(world.get(1).labels.has('devin-failed')).toBe(true);
  });

  it('再投稿の前にセッション URL が来ていたら、再投稿せず done にする', async () => {
    world.addIssue(1, ['devin-waiting'], 't', marker('100.001', 'pending', 1));
    world.replies = [{ text: SESSION, bot_id: 'B1' }];
    await relay.sweep(world.args());
    expect(world.posts).toHaveLength(0);
    expect(world.marker(1)).toMatchObject({ status: 'done' });
  });

  it('人が trigger ラベルを付け直した issue は、sweep が重複して再投稿しない', async () => {
    world.addIssue(1, ['devin-waiting', 'for-devin'], 't', marker('100.001', 'pending', 1));
    await relay.sweep(world.args());
    expect(world.posts).toHaveLength(0);
  });

  it('Slack が落ちていても tries は進む（無限に再投稿しない）', async () => {
    world.addIssue(1, ['devin-waiting'], 't', marker('100.001', 'pending', 0));
    world.postError = () => 'ratelimited';
    for (let i = 0; i < 3; i++) await relay.sweep(world.args());
    expect(world.marker(1)).toMatchObject({ status: 'pending', tries: 3 });
    await relay.sweep(world.args());
    expect(world.marker(1)).toMatchObject({ status: 'failed' });
  });

  it('マーカーが無いのに trigger ラベルだけある issue は、pending に正して回収する', async () => {
    world.addIssue(1, ['for-devin']);
    await relay.sweep(world.args());
    expect(world.marker(1)).toMatchObject({ status: 'pending' });
    expect(world.get(1).labels.has('for-devin')).toBe(false);
    expect(world.get(1).labels.has('devin-waiting')).toBe(true);
  });

  it('bot 以外が書いた偽のマーカーは信頼しない', async () => {
    world.addIssue(1, ['devin-queued'], 't', marker('999.999', 'triggered'), 'User');
    await relay.sweep(world.args());
    // 偽マーカーを「起動済み」と読んでいれば、投稿されない
    expect(world.posts).toHaveLength(1);
    expect(world.marker(1)).toMatchObject({ status: 'triggered' });
    expect(world.marker(1)?.ts).not.toBe('999.999');
  });

  it('1 件が失敗しても、残りの issue は処理する', async () => {
    world.addIssue(1, ['devin-queued']).listFails = true;
    world.addIssue(2, ['devin-queued']);
    await relay.sweep(world.args());
    expect(world.warnings.join()).toContain('issue #1');
    expect(world.marker(2)).toMatchObject({ status: 'triggered' });
  });

  it('Project フィールドは DEVIN_PROJECT_NUMBER が無ければ触らない', async () => {
    world.addIssue(1, ['devin-queued']);
    await relay.sweep(world.args());
    expect(world.warnings).toEqual([]);
  });
});
