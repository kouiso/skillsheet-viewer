import type { ProfileBlockData } from '@skillsheet/db/blocks';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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

const SHORT_PR = '短い自己PRです。'; // 88文字未満
const LONG_PR = 'あ'.repeat(89); // 89文字以上

describe('ProfileIntro', () => {
  it('SP: メタ dl の order が自己PR pの order より小さい（メタ→強み→自己PRの順、#190）', () => {
    render(<ProfileIntro data={buildData({ pr: SHORT_PR })} />);
    const meta = screen.getByText('28歳').closest('dl');
    const pr = screen.getByText(SHORT_PR);
    expect(meta?.className).toContain('order-2');
    expect(pr.className).toContain('order-4');
  });

  it('sm 以上: メタが sm:order-4、自己PRが sm:order-2 に戻る', () => {
    render(<ProfileIntro data={buildData({ pr: SHORT_PR })} />);
    const meta = screen.getByText('28歳').closest('dl');
    const pr = screen.getByText(SHORT_PR);
    expect(meta?.className).toContain('sm:order-4');
    expect(pr.className).toContain('sm:order-2');
  });

  it('自己PRが短いときは「続きを読む」ボタンが出ない', () => {
    render(<ProfileIntro data={buildData({ pr: SHORT_PR })} />);
    expect(screen.queryByRole('button', { name: /続きを読む/ })).toBeNull();
  });

  it('自己PRが長いときはボタンが出て、クリックで展開される', () => {
    render(<ProfileIntro data={buildData({ pr: LONG_PR })} />);
    const button = screen.getByRole('button', { name: /続きを読む/ });
    expect(button).toBeInTheDocument();

    const pr = screen.getByText(LONG_PR);
    expect(pr.className).toContain('line-clamp-4');

    fireEvent.click(button);
    expect(screen.getByRole('button', { name: /折りたたむ/ })).toBeInTheDocument();
    expect(pr.className).not.toContain('line-clamp-4');
  });

  it('sm 以上では折りたたみボタンが無い代わりに line-clamp が常に解除される（#190 回帰: 長文PRがsm+で読めなくなる不具合の防止）', () => {
    render(<ProfileIntro data={buildData({ pr: LONG_PR })} />);
    const pr = screen.getByText(LONG_PR);
    // SP では line-clamp-4 が付くが、sm 以上では sm:line-clamp-none で必ず解除されること。
    expect(pr.className).toContain('line-clamp-4');
    expect(pr.className).toContain('sm:line-clamp-none');
  });
});
