import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CreateSheetDialog } from './create-sheet-dialog';

const renderDialog = (overrides: Partial<Parameters<typeof CreateSheetDialog>[0]> = {}) => {
  const props = {
    title: '新しいスキルシート',
    templateId: 'console-dashboard',
    busy: false,
    error: null,
    onTitleChange: vi.fn(),
    onTemplateChange: vi.fn(),
    onClose: vi.fn(),
    onCreate: vi.fn(),
    ...overrides,
  };
  render(<CreateSheetDialog {...props} />);
  return props;
};

// デザインボード n05b-dark / solo-create-light / solo-create-dark の「新しいシートを作る」ダイアログ。
describe('CreateSheetDialog（デザインボード U11）', () => {
  it('題は「新しいシートを作る」で、板に無い説明文は出さない', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog', { name: '新しいシートを作る' });
    expect(within(dialog).getByRole('heading', { name: '新しいシートを作る' })).toBeInTheDocument();
    expect(dialog).not.toHaveAttribute('aria-describedby');
    expect(within(dialog).queryByText(/タイトルとテンプレートを選んで/)).not.toBeInTheDocument();
  });

  it('ボタンは「やめる」「作る」で、「キャンセル」「作成」は出さない', async () => {
    const props = renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'キャンセル' })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: '作成' })).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(dialog).getByRole('button', { name: '作る' }));
    expect(props.onCreate).toHaveBeenCalledOnce();
    await user.click(within(dialog).getByRole('button', { name: 'やめる' }));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('項目は 題 → タイトル → テンプレート（2列4枚）→ ボタンの順で、板の名前と副説明が並ぶ', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('タイトル')).toHaveValue('新しいスキルシート');
    const group = within(dialog).getByRole('group', { name: 'テンプレート' });
    const cards = within(group).getAllByRole('radio');
    expect(cards.map((card) => card.closest('label')?.textContent)).toEqual([
      '空白ブロックなしで始める',
      '技術者プロファイル見出しと項目表',
      'フルスキルシートプロファイル・スキル・職務経歴',
      'ダッシュボードプロフィール・統計・スキル・案件',
    ]);
    expect(cards.map((card) => (card as HTMLInputElement).checked)).toEqual([false, false, false, true]);
    expect(cards[0].closest('div')?.className).toContain('grid-cols-2');
  });

  it('ボタンは右寄せで、390 では縦積み（やめるが下）になる', () => {
    renderDialog();
    const footer = screen.getByRole('button', { name: '作る' }).parentElement as HTMLElement;
    expect(footer.className).toContain('min-[480px]:justify-end');
    expect(footer.className).toContain('flex-col-reverse');
    const buttons = within(footer).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['やめる', '作る']);
  });

  it('作成中は「作成中…」を出して二重送信できない', () => {
    renderDialog({ busy: true });
    expect(screen.getByRole('button', { name: '作成中…' })).toBeDisabled();
  });
});
