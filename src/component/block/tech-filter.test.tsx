import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { type TechCount, TechFilter } from './tech-filter';

const noop = {
  query: '',
  onQueryChange: vi.fn(),
  onToggle: vi.fn(),
  onClear: vi.fn(),
};

const ALL: TechCount[] = [
  { name: 'TypeScript', count: 3, bucket: 'lang' },
  { name: 'React', count: 2, bucket: 'fw' },
  { name: 'OnlyOnce', count: 1, bucket: 'tools' },
];

describe('TechFilter', () => {
  it('未選択の技術チップは出さない（チップ雲を置かない）', () => {
    render(<TechFilter all={ALL} active={[]} count={3} total={3} {...noop} />);

    expect(screen.queryByRole('button', { name: /TypeScript/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /すべての技術を表示/ })).toBeNull();
  });

  it('案件検索欄は技術選択と別に残る', () => {
    render(<TechFilter all={ALL} active={[]} count={3} total={3} {...noop} />);

    expect(screen.getByPlaceholderText('案件・技術・役割を検索…')).toBeTruthy();
    expect(screen.getByLabelText('技術を選ぶ')).toBeTruthy();
  });

  it('技術選択に入力すると一致する技術が出る（1件だけの技術も含む）', async () => {
    const user = userEvent.setup();
    render(<TechFilter all={ALL} active={[]} count={3} total={3} {...noop} />);

    await user.click(screen.getByLabelText('技術を選ぶ'));
    await user.type(screen.getByLabelText('技術を選ぶ'), 'Only');

    expect(screen.getByRole('option', { name: /OnlyOnce/ })).toBeTruthy();
  });

  // 言語・インフラ・ツールが無分類で並ぶと何が「技術」扱いか読み取れないため、
  // 案件カードと同じバケットラベルの見出しで候補をグルーピングする（#314）。
  it('候補はバケットラベルの見出しでグルーピングされる', async () => {
    const user = userEvent.setup();
    const all: TechCount[] = [
      { name: 'JavaScript', count: 2, bucket: 'lang' },
      { name: 'AWS', count: 2, bucket: 'infra' },
      { name: 'VSCode', count: 1, bucket: 'tools' },
    ];
    render(<TechFilter all={all} active={[]} count={3} total={3} {...noop} />);

    await user.click(screen.getByLabelText('技術を選ぶ'));

    // ツールの VSCode は「ツール」見出しのグループに入り、「技術」として無説明に並ばない。
    const toolsGroup = screen.getByRole('group', { name: 'ツール' });
    expect(within(toolsGroup).getByRole('option', { name: /VSCode/ })).toBeTruthy();
    expect(within(screen.getByRole('group', { name: 'インフラ' })).getByRole('option', { name: /AWS/ })).toBeTruthy();
    expect(
      within(screen.getByRole('group', { name: '言語' })).getByRole('option', { name: /JavaScript/ }),
    ).toBeTruthy();
    // 候補の無いバケットの見出しは出さない。
    expect(screen.queryByRole('group', { name: 'DB' })).toBeNull();
  });

  it('グループをまたいで矢印キー移動と Enter 選択ができる', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<TechFilter all={ALL} active={[]} count={3} total={3} {...noop} onToggle={onToggle} />);

    const input = screen.getByLabelText('技術を選ぶ');
    await user.click(input);
    // 3件目の OnlyOnce は tools グループ。見出しを option に数えず、フラットな候補順で移動する。
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{Enter}');

    expect(onToggle).toHaveBeenCalledWith('OnlyOnce');
  });

  it('候補パネルは固定会社見出しより前面に表示する', async () => {
    const user = userEvent.setup();
    render(<TechFilter all={ALL} active={[]} count={3} total={3} {...noop} />);

    await user.click(screen.getByLabelText('技術を選ぶ'));

    expect(screen.getByRole('listbox')).toHaveClass('z-30');
  });

  it('選んだ技術はチップになり aria-pressed=true になる', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(
      <TechFilter
        all={ALL}
        active={['TypeScript']}
        count={1}
        total={3}
        query=""
        onQueryChange={vi.fn()}
        onToggle={onToggle}
        onClear={vi.fn()}
      />,
    );

    const chip = screen.getByRole('button', { name: /TypeScript/ });
    expect(chip).toHaveAttribute('aria-pressed', 'true');

    await user.click(chip);
    expect(onToggle).toHaveBeenCalledWith('TypeScript');
  });
  // 候補の「選ぶ」経路（クリック / 矢印キー + Enter）が壊れてもテストが気づけなかったため追加。
  it('候補をクリックすると onToggle が呼ばれ、パネルが閉じる', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<TechFilter all={ALL} active={[]} count={3} total={3} {...noop} onToggle={onToggle} />);

    const input = screen.getByLabelText('技術を選ぶ');
    await user.click(input);
    await user.type(input, 'Only');
    await user.click(screen.getByRole('option', { name: /OnlyOnce/ }));

    expect(onToggle).toHaveBeenCalledWith('OnlyOnce');
    // 選んだ直後に候補が絞り込み結果を覆い隠さないこと。
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('ArrowDown + Enter で先頭の候補を選べる', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<TechFilter all={ALL} active={[]} count={3} total={3} {...noop} onToggle={onToggle} />);

    const input = screen.getByLabelText('技術を選ぶ');
    await user.click(input);
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onToggle).toHaveBeenCalledWith(ALL[0].name);
  });

  it('未選択から ArrowUp を押すと末尾の候補が選ばれる（末尾から2番目に飛ばない）', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<TechFilter all={ALL} active={[]} count={3} total={3} {...noop} onToggle={onToggle} />);

    const input = screen.getByLabelText('技術を選ぶ');
    await user.click(input);
    await user.keyboard('{ArrowUp}{Enter}');

    expect(onToggle).toHaveBeenCalledWith(ALL[ALL.length - 1].name);
  });

  it('矢印キーで移動中の候補を aria-activedescendant が指す', async () => {
    const user = userEvent.setup();
    render(<TechFilter all={ALL} active={[]} count={3} total={3} {...noop} />);

    const input = screen.getByLabelText('技術を選ぶ');
    await user.click(input);
    expect(input).not.toHaveAttribute('aria-activedescendant');

    await user.keyboard('{ArrowDown}');
    const activeId = input.getAttribute('aria-activedescendant');
    expect(activeId).toBeTruthy();

    const listbox = screen.getByRole('listbox');
    expect(input).toHaveAttribute('aria-controls', listbox.id);
    expect(document.getElementById(activeId as string)).toHaveAttribute('role', 'option');
    expect(document.getElementById(activeId as string)).toHaveAttribute('aria-selected', 'true');
  });

  it('検索欄の下に OR/AND のヒントを出す', () => {
    render(<TechFilter all={ALL} active={[]} count={3} total={3} {...noop} />);
    expect(screen.getByText(/スペース区切りはどれかを含む案件/)).toBeInTheDocument();
  });

  it('クエリに AND が入っていれば AND のヒントに切り替える', () => {
    render(<TechFilter all={ALL} active={[]} count={3} total={3} {...noop} query="React AND TypeScript" />);
    expect(screen.getByText(/すべての語を含む案件だけを表示/)).toBeInTheDocument();
  });
});
