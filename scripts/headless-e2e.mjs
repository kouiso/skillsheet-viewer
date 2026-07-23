import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

const appPort = 3210;
const debuggingPort = 9222;
const evidenceDir = join(process.cwd(), 'test-results/e2e');

const browserCandidates = [
  process.env.CHROME_PATH,
  'google-chrome',
  'google-chrome-stable',
  'chromium',
  'chromium-browser',
].filter(Boolean);

function start(command, args, options = {}) {
  return spawn(command, args, { stdio: 'inherit', ...options });
}

async function waitFor(url, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // 起動中の接続失敗は想定内。短い間隔で再試行する。
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`${url} が ${timeout}ms 以内に応答しませんでした`);
}

async function findBrowser() {
  for (const candidate of browserCandidates) {
    const probe = spawn(candidate, ['--version'], { stdio: 'ignore' });
    const code = await new Promise((resolve) => {
      probe.once('error', () => resolve(-1));
      probe.once('exit', resolve);
    });
    if (code === 0) return candidate;
  }
  throw new Error(`Chrome/Chromium が見つかりません（探索: ${browserCandidates.join(', ')}）`);
}

function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let sequence = 0;
  const pending = new Map();
  const listeners = new Map();

  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
      return;
    }
    for (const listener of listeners.get(message.method) ?? []) listener(message.params);
  });

  return {
    ready: new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    }),
    send(method, params = {}) {
      const id = ++sequence;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
    once(method) {
      return new Promise((resolve) => {
        const handler = (params) => {
          listeners.set(
            method,
            (listeners.get(method) ?? []).filter((item) => item !== handler),
          );
          resolve(params);
        };
        listeners.set(method, [...(listeners.get(method) ?? []), handler]);
      });
    },
    on(method, listener) {
      listeners.set(method, [...(listeners.get(method) ?? []), listener]);
    },
    close: () => socket.close(),
  };
}

async function openPage(browserBaseUrl) {
  const response = await fetch(`${browserBaseUrl}/json/new?about:blank`, { method: 'PUT' });
  assert.equal(response.ok, true, `CDP page作成に失敗しました: ${response.status}`);
  const target = await response.json();
  const cdp = connectCdp(target.webSocketDebuggerUrl);
  await cdp.ready;
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable')]);
  return cdp;
}

async function verifyPage(cdp, scenario) {
  const errors = [];
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    errors.push(exceptionDetails.text);
  });
  cdp.on('Runtime.consoleAPICalled', ({ type, args }) => {
    if (type === 'error') errors.push(args.map((arg) => arg.value ?? arg.description).join(' '));
  });

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: scenario.width,
    height: scenario.height,
    deviceScaleFactor: 1,
    mobile: scenario.width <= 390,
  });
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${appPort}${scenario.path}` });
  await loaded;
  await new Promise((resolve) => setTimeout(resolve, 1_000));

  const { result } = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => ({
      title: document.querySelector('h1')?.textContent?.trim(),
      labels: [...document.querySelectorAll('label')].map((node) => node.textContent?.trim()),
      buttons: [...document.querySelectorAll('button')].map((node) => node.textContent?.trim()),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      url: location.pathname,
    }))()`,
  });
  const facts = result.value;
  assert.equal(facts.url, scenario.path);
  assert.equal(facts.title, scenario.title);
  for (const label of scenario.labels) assert.ok(facts.labels.includes(label), `${label} が表示されていません`);
  assert.ok(facts.buttons.includes(scenario.button), `${scenario.button} が表示されていません`);
  assert.equal(facts.horizontalOverflow, false, `${scenario.width}px 幅で横スクロールが発生しています`);
  assert.deepEqual(errors, [], `ブラウザエラーが発生しました: ${errors.join('\n')}`);

  const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await writeFile(join(evidenceDir, `${scenario.name}.png`), Buffer.from(screenshot.data, 'base64'));
  return { ...scenario, facts, browserErrors: errors };
}

await mkdir(evidenceDir, { recursive: true });
const evidencePath = join(evidenceDir, 'results.json');
await writeFile(
  evidencePath,
  `${JSON.stringify({ recordedAt: new Date().toISOString(), status: 'running', results: [] }, null, 2)}\n`,
);
const server = start('pnpm', ['start', '-p', String(appPort)], {
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://e2e.invalid/e2e',
    SESSION_SECRET: process.env.SESSION_SECRET ?? 'e2e-session-secret-at-least-32-characters',
    VIEWER_CODE: process.env.VIEWER_CODE ?? 'e2e-viewer-code',
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? 'e2e-better-auth-secret-at-least-32-characters',
    SKILLSHEET_OWNER_ID: process.env.SKILLSHEET_OWNER_ID ?? 'e2e-owner',
  },
});

let browser;
try {
  await waitFor(`http://127.0.0.1:${appPort}/viewer-auth`);
  const executable = await findBrowser();
  browser = start(executable, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${debuggingPort}`,
    `--user-data-dir=/tmp/skillsheet-e2e-${process.pid}`,
    'about:blank',
  ]);
  const versionResponse = await waitFor(`http://127.0.0.1:${debuggingPort}/json/version`);
  const version = await versionResponse.json();
  assert.match(version.Browser, /(Chrome|Chromium)/);

  const scenarios = [
    {
      name: 'login-desktop',
      path: '/login',
      title: '編集者ログイン',
      labels: ['メールアドレス', 'パスワード'],
      button: 'ログイン',
      width: 1440,
      height: 900,
    },
    {
      name: 'viewer-auth-mobile',
      path: '/viewer-auth',
      title: 'エンジニアスキルシート閲覧',
      labels: ['認証コード'],
      button: '認証',
      width: 390,
      height: 844,
    },
  ];
  const results = [];
  for (const scenario of scenarios) {
    const page = await openPage(`http://127.0.0.1:${debuggingPort}`);
    results.push(await verifyPage(page, scenario));
    page.close();
  }
  await writeFile(
    evidencePath,
    `${JSON.stringify(
      { recordedAt: new Date().toISOString(), status: 'passed', browser: version.Browser, results },
      null,
      2,
    )}\n`,
  );
  console.log(`Headless E2E: ${results.length} シナリオ成功（証跡: ${evidenceDir}）`);
} catch (error) {
  await writeFile(
    evidencePath,
    `${JSON.stringify(
      { recordedAt: new Date().toISOString(), status: 'failed', error: String(error), results: [] },
      null,
      2,
    )}\n`,
  );
  throw error;
} finally {
  browser?.kill('SIGTERM');
  server.kill('SIGTERM');
}
