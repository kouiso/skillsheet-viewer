import type { ProfileBlockData } from '@skillsheet/db/blocks';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
// 差し替えて「表示行数を超えて隠れている/いない」を再現する（grow-textarea.test.tsx と同じ手法）。
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
  it('SP では DOM順=視覚順が氏名→メタ→強み→自己PRに一致する（スクリーンリーダーの読み上げ順対策）', () => {
    render(<ProfileIntro data={buildData({})} />);
    const sp = screen.getByTestId('profile-intro-sp');
    const name = screen.getByText('山田太郎');
    const meta = within(sp).getByText('28歳').closest('dl') as HTMLElement;
    const strengths = within(sp).getByText('React').closest('ul') as HTMLElement;
    const pr = within(sp).getByText('自己PRです。');

    // Node.compareDocumentPosition で実際の DOM 出現順を検証する
    // (DOCUMENT_POSITION_FOLLOWING = 4: 第一引数が第二引数より後ろにある)
    expect(name.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(meta.compareDocumentPosition(strengths) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strengths.compareDocumentPosition(pr) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sm 以上では DOM順=視覚順が氏名→自己PR→強み→メタに一致する（Issue #221）', () => {
    render(<ProfileIntro data={buildData({})} />);
    const desktop = screen.getByTestId('profile-intro-desktop');
    const name = screen.getByText('山田太郎');
    const pr = within(desktop).getByText('自己PRです。');
    const strengths = within(desktop).getByText('React').closest('ul') as HTMLElement;
    const meta = within(desktop).getByText('28歳').closest('dl') as HTMLElement;

    expect(name.compareDocumentPosition(pr) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pr.compareDocumentPosition(strengths) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(strengths.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('自己PRが実際に表示行数に収まっているときは「続きを読む」ボタンが出ない', () => {
    scrollHeight = 100;
    clientHeight = 100; // scrollHeight === clientHeight ＝ 切り詰められていない
    render(<ProfileIntro data={buildData({})} />);
    const sp = screen.getByTestId('profile-intro-sp');
    expect(within(sp).queryByRole('button', { name: /続きを読む/ })).toBeNull();
  });

  it('自己PRが表示行数を超えて隠れているときはボタンが出て、クリックで展開される', () => {
    scrollHeight = 200;
    clientHeight = 100; // scrollHeight > clientHeight ＝ line-clamp で切り詰められている
    const pr = 'あ'.repeat(200);
    render(<ProfileIntro data={buildData({ pr })} />);

    const sp = screen.getByTestId('profile-intro-sp');
    const button = within(sp).getByRole('button', { name: /続きを読む/ });
    expect(button).toBeInTheDocument();

    const prEl = within(sp).getByText(pr);
    expect(prEl.className).toContain('line-clamp-6');

    fireEvent.click(button);
    expect(within(sp).getByRole('button', { name: /折りたたむ/ })).toBeInTheDocument();
    expect(prEl.className).not.toContain('line-clamp-6');
  });

  it('トグルは aria-expanded / aria-controls で開閉状態と対象を伝え、44px のタップ領域を持つ（レビュー指摘）', () => {
    scrollHeight = 200;
    clientHeight = 100;
    const pr = 'あ'.repeat(200);
    render(<ProfileIntro data={buildData({ pr })} />);

    const sp = screen.getByTestId('profile-intro-sp');
    const button = within(sp).getByRole('button', { name: /続きを読む/ });
    const prEl = within(sp).getByText(pr);

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', prEl.id);
    expect(prEl.id).not.toBe('');
    // #192 で他の操作ボタンに揃えた 44px 基準をこのトグルにも適用している。
    expect(button.className).toContain('min-h-11');

    fireEvent.click(button);
    expect(within(sp).getByRole('button', { name: /折りたたむ/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('文字数が少なくても改行区切りで表示行数を超えていればボタンが出る（レビュー指摘: 文字数しきい値では検出できない回帰の防止）', () => {
    scrollHeight = 200;
    clientHeight = 100; // 短文でも実測で切り詰め有りと判定される状況を再現
    const shortMultilinePr = 'あ\nい\nう\nえ\nお'; // 9文字・5行
    render(<ProfileIntro data={buildData({ pr: shortMultilinePr })} />);
    const sp = screen.getByTestId('profile-intro-sp');
    expect(within(sp).getByRole('button', { name: /続きを読む/ })).toBeInTheDocument();
  });

  it('sm 以上では折りたたみボタンが無い代わりに line-clamp が常に解除される（#190 回帰: 長文PRがsm+で読めなくなる不具合の防止）', () => {
    scrollHeight = 200;
    clientHeight = 100;
    const pr = 'あ'.repeat(200);
    render(<ProfileIntro data={buildData({ pr })} />);
    const desktop = screen.getByTestId('profile-intro-desktop');
    const prEl = within(desktop).getByText(pr);
    // デスクトップ版は常に全文表示。
    expect(prEl.className).toContain('line-clamp-none');
    // かつボタンは存在しない。
    expect(within(desktop).queryByRole('button')).toBeNull();
  });

  it('SP の自己PRは line-clamp-6 を持ち、sm 以上では sm:line-clamp-none で解除される', () => {
    scrollHeight = 200;
    clientHeight = 100;
    const pr = 'あ'.repeat(200);
    render(<ProfileIntro data={buildData({ pr })} />);
    const sp = screen.getByTestId('profile-intro-sp');
    const prEl = within(sp).getByText(pr);
    expect(prEl.className).toContain('line-clamp-6');
    expect(prEl.className).toContain('sm:line-clamp-none');
  });

  it('メタ情報の値は min-w-0 + break-words で長い値でも折り返せる（レビュー指摘: 2列グリッドでの隣接列への重なり防止）', () => {
    render(<ProfileIntro data={buildData({ meta: { qualifications: 'Very-Long-Unbroken-Certification-Name' } })} />);
    const sp = screen.getByTestId('profile-intro-sp');
    const dd = within(sp).getByText('Very-Long-Unbroken-Certification-Name');
    const row = dd.closest('div');
    expect(dd.className).toContain('break-words');
    expect(dd.className).toContain('min-w-0');
    expect(row?.className).toContain('min-w-0');
  });

  it('任意ラベル（Issue #193）が長くてもラベル側が折り返せる（レビュー指摘: shrink-0 のままだと隣接列に重なる）', () => {
    const longLabel = 'ProfessionalCertificationDetails';
    render(<ProfileIntro data={buildData({ meta: { [longLabel]: '値' } })} />);
    const sp = screen.getByTestId('profile-intro-sp');
    const dt = within(sp).getByText(longLabel);
    // shrink-0 は短いラベルを潰さないために残すが、max-w で flex の基準サイズを
    // クランプし break-words で折り返せるようにしないとセル幅を超える。
    expect(dt.className).toContain('shrink-0');
    expect(dt.className).toContain('max-w-[50%]');
    expect(dt.className).toContain('break-words');
  });

  it('Webフォント読み込み完了時（document.fonts.ready）に自己PRの切り詰め判定を再測定する（レビュー指摘: preload:false+display:swap によるフォント差し替え対策）', async () => {
    scrollHeight = 100;
    clientHeight = 100; // 初回はフォールバックフォントで表示行数に収まっている想定
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
      const sp = screen.getByTestId('profile-intro-sp');
      expect(within(sp).queryByRole('button', { name: /続きを読む/ })).toBeNull();

      // Webフォントへの差し替えで折り返しが増え、表示行数に収まらなくなったことを再現する。
      scrollHeight = 200;
      await act(async () => {
        resolveFontsReady();
        await fontsReadyPromise;
      });

      expect(within(sp).getByRole('button', { name: /続きを読む/ })).toBeInTheDocument();
    } finally {
      Object.defineProperty(document, 'fonts', { configurable: true, value: originalFonts });
    }
  });
});
