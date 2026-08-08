import type { ProfileBlockData } from '@skillsheet/db/blocks';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ProfileIntro } from './profile-intro';

function buildData(overrides: Partial<ProfileBlockData>): ProfileBlockData {
  return {
    name: '山田太郎',
    title: 'フルスタックエンジニア',
    pr: '自己PRです。',
    strengths: ['React', 'TypeScript'],
    meta: { age: '28歳', work: 'フルリモート' },
    ...overrides,
  };
}

// jsdom はレイアウトを持たないため、自己PR段落の scrollHeight/clientHeight を
// 差し替えて「4行を超えて隠れている/いない」を再現する（grow-textarea.test.tsx と同じ手法）。
let scrollHeight = 100;
let clientHeight = 100;

const original = {
  scrollHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight'),
  clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
};

beforeEach(() => {
  scrollHeight = 100;
  clientHeight = 100;
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => scrollHeight });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => clientHeight });
});

afterEach(() => {
  if (original.scrollHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', original.scrollHeight);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  if (original.clientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', original.clientHeight);
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
});

describe('ProfileIntro', () => {
  it('DOM順は SP の視覚順（氏名→メタ→強み→自己PR）に一致する（スクリーンリーダーの読み上げ順対策）', () => {
    render(<ProfileIntro data={buildData({})} />);
    const name = screen.getByText('山田太郎');
    const meta = screen.getByText('28歳').closest('dl') as HTMLElement;
    const strengths = screen.getByText('React').closest('ul') as HTMLElement;
    const pr = screen.getByText('自己PRです。');

    // Node.compareDocumentPosition で実際の DOM 出現順を検証する
    // (DOCUMENT_POSITION_FOLLOWING = 4: 第一引数が第二引数より後ろにある)
    expect(name.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(meta.compareDocumentPosition(strengths) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strengths.compareDocumentPosition(pr) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sm 以上の視覚順は氏名→自己PR→強み→メタに戻す（sm:order-*）', () => {
    render(<ProfileIntro data={buildData({})} />);
    const meta = screen.getByText('28歳').closest('dl');
    const pr = screen.getByText('自己PRです。');
    const strengths = screen.getByText('React').closest('ul');
    expect(pr.className).toContain('sm:order-2');
    expect(strengths?.className).toContain('sm:order-3');
    expect(meta?.className).toContain('sm:order-4');
  });

  it('自己PRが実際に4行に収まっているときは「続きを読む」ボタンが出ない', () => {
    scrollHeight = 100;
    clientHeight = 100; // scrollHeight === clientHeight ＝ 切り詰められていない
    render(<ProfileIntro data={buildData({})} />);
    expect(screen.queryByRole('button', { name: /続きを読む/ })).toBeNull();
  });

  it('自己PRが4行を超えて隠れているときはボタンが出て、クリックで展開される', () => {
    scrollHeight = 200;
    clientHeight = 100; // scrollHeight > clientHeight ＝ line-clamp で切り詰められている
    const pr = 'あ'.repeat(200);
    render(<ProfileIntro data={buildData({ pr })} />);

    const button = screen.getByRole('button', { name: /続きを読む/ });
    expect(button).toBeInTheDocument();

    const prEl = screen.getByText(pr);
    expect(prEl.className).toContain('line-clamp-4');

    fireEvent.click(button);
    expect(screen.getByRole('button', { name: /折りたたむ/ })).toBeInTheDocument();
    expect(prEl.className).not.toContain('line-clamp-4');
  });

  it('文字数が少なくても改行区切りで4行を超えていればボタンが出る（レビュー指摘: 文字数しきい値では検出できない回帰の防止）', () => {
    scrollHeight = 200;
    clientHeight = 100; // 短文でも実測で切り詰め有りと判定される状況を再現
    const shortMultilinePr = 'あ\nい\nう\nえ\nお'; // 9文字・5行
    render(<ProfileIntro data={buildData({ pr: shortMultilinePr })} />);
    expect(screen.getByRole('button', { name: /続きを読む/ })).toBeInTheDocument();
  });

  it('sm 以上では折りたたみボタンが無い代わりに line-clamp が常に解除される（#190 回帰: 長文PRがsm+で読めなくなる不具合の防止）', () => {
    scrollHeight = 200;
    clientHeight = 100;
    const pr = 'あ'.repeat(200);
    render(<ProfileIntro data={buildData({ pr })} />);
    const prEl = screen.getByText(pr);
    // SP では line-clamp-4 が付くが、sm 以上では sm:line-clamp-none で必ず解除されること。
    expect(prEl.className).toContain('line-clamp-4');
    expect(prEl.className).toContain('sm:line-clamp-none');
  });

  it('メタ情報の値は min-w-0 + break-words で長い値でも折り返せる（レビュー指摘: 2列グリッドでの隣接列への重なり防止）', () => {
    render(<ProfileIntro data={buildData({ meta: { qualifications: 'Very-Long-Unbroken-Certification-Name' } })} />);
    const dd = screen.getByText('Very-Long-Unbroken-Certification-Name');
    const row = dd.closest('div');
    expect(dd.className).toContain('break-words');
    expect(dd.className).toContain('min-w-0');
    expect(row?.className).toContain('min-w-0');
  });

  it('Webフォント読み込み完了時（document.fonts.ready）に自己PRの切り詰め判定を再測定する（レビュー指摘: preload:false+display:swap によるフォント差し替え対策）', async () => {
    scrollHeight = 100;
    clientHeight = 100; // 初回はフォールバックフォントで4行に収まっている想定
    let resolveFontsReady: () => void = () => {};
    const fontsReadyPromise = new Promise<FontFaceSet>((resolve) => {
      resolveFontsReady = () => resolve({} as FontFaceSet);
    });
    const originalFonts = document.fonts;
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: fontsReadyPromise },
    });

    try {
      const pr = 'あ'.repeat(200);
      render(<ProfileIntro data={buildData({ pr })} />);
      expect(screen.queryByRole('button', { name: /続きを読む/ })).toBeNull();

      // Webフォントへの差し替えで折り返しが増え、4行に収まらなくなったことを再現する。
      scrollHeight = 200;
      await act(async () => {
        resolveFontsReady();
        await fontsReadyPromise;
      });

      expect(screen.getByRole('button', { name: /続きを読む/ })).toBeInTheDocument();
    } finally {
      Object.defineProperty(document, 'fonts', { configurable: true, value: originalFonts });
    }
  });
});
