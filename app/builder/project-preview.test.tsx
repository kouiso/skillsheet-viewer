import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectItem } from '@/db/block';

import { ProjectPreview } from './project-preview';

const project = (over: Partial<ProjectItem> = {}): ProjectItem => ({
  id: 'p1',
  companyId: 'c1',
  title: '受発注システムの刷新',
  scope: '販売管理',
  period: '2024/04 - 2025/03',
  role: 'テックリード',
  team: '6',
  tech: { lang: ['TypeScript'], fw: ['Next.js'], db: [], infra: [], tools: [], collab: [] },
  process: ['要件定義', '実装'],
  duties: '設計と実装を担当した。',
  acquired: '大規模移行の知見。',
  comment: '継続支援中。',
  summary: '基幹の受発注を刷新した。',
  ...over,
});

const slotsOf = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-pv-slot]')).map((el) => el.dataset.pvSlot);

describe('ProjectPreview のメタ行', () => {
  it('役割は会社・人数・期間と同じ1行に出る（閲覧側 #289/#290 と同じ構成）', () => {
    const { container } = render(
      <ProjectPreview
        project={project({ role: 'SE', team: '9', duration: '9ヶ月' })}
        company={{ id: 'c1', name: 'D社', kind: '', period: '', note: '' }}
        no={1}
      />,
    );

    const meta = container.querySelector('[data-pv-slot="meta"]');
    expect(meta?.textContent).toContain('SE · D社 · 9名 · 9ヶ月');
    expect(meta?.textContent).toContain('役割');
    // 見出しの左右2枠（.pv-top）が残っていると役割の位置が案件ごとにずれる（#289）。
    expect(container.querySelector('.pv-top')).toBeNull();
  });

  it('役割が空なら、閲覧画面の案件カードと同じく「役割」ラベルを出さない', () => {
    const { container } = render(<ProjectPreview project={project({ role: '' })} company={undefined} no={1} />);
    const meta = container.querySelector('[data-pv-slot="meta"]');
    expect(meta?.textContent).not.toContain('役割');
    expect(meta?.textContent).toContain('6名');
  });
});

describe('ProjectPreview は閲覧画面の案件カードと同じ出方をする（#636）', () => {
  const periodItem = { period: '2024.04 — 2025.03', duration: '' };

  it('手入力の月数が無くても、期間から計算した月数が出る', () => {
    const { container } = render(<ProjectPreview project={project(periodItem)} company={undefined} no={1} />);
    expect(container.querySelector('[data-pv-slot="meta"]')?.textContent).toContain('1年');
  });

  it('「現在」終わりの案件でも、月数が「未確定」にならない', () => {
    const { container } = render(
      <ProjectPreview project={project({ period: '2024.04 — 現在', duration: '' })} company={undefined} no={1} />,
    );
    const meta = container.querySelector('[data-pv-slot="meta"]')?.textContent ?? '';
    expect(meta).not.toContain('未確定');
    expect(meta).toMatch(/ヶ月|年/);
  });

  it('技術は分類ごとに全部出て、「+N」で切らず、展開ボタンも出ない', () => {
    const lang = Array.from({ length: 20 }, (_, i) => `技術${i + 1}`);
    const { container, queryByRole, getByText } = render(
      <ProjectPreview
        project={project({ tech: { lang, fw: ['Next.js'], db: [], infra: [], tools: [], collab: [] } })}
        company={undefined}
        no={1}
      />,
    );
    expect(getByText('技術20')).toBeVisible();
    expect(container.textContent).not.toMatch(/\+\d+/);
    expect(queryByRole('button', { name: /すべての技術を表示/ })).toBeNull();
    // 分類名（使用言語など）が閲覧画面と同じく見出しとして出る。
    expect(container.querySelector('[data-pv-slot="tech"]')?.textContent).toContain('Next.js');
  });

  it('概要・担当業務・習得スキル・コメント・担当工程・技術の全部が編集欄への飛び先になる', () => {
    const { container } = render(<ProjectPreview project={project()} company={undefined} no={1} />);
    expect(slotsOf(container)).toEqual([
      'period',
      'title',
      'scope',
      'meta',
      'summary',
      'duties',
      'acquired',
      'comment',
      'process',
      'tech',
    ]);
  });
});

const tabbable = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-pv-slot]')).filter((el) => el.tabIndex === 0);

/** タブで止まる要素を種類によらず全部数える（[data-pv-slot] だけだと、中のボタンやリンクを見落とす）。 */
const focusStops = (container: HTMLElement) =>
  Array.from(
    container.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [tabindex]'),
  ).filter((el) => el.tabIndex === 0);

describe('ProjectPreview のキーボード移動', () => {
  it('プレビュー列全体で tab の止まり先は1箇所だけ', () => {
    const { container } = render(<ProjectPreview project={project()} company={undefined} no={1} />);

    expect(slotsOf(container).length).toBeGreaterThan(5);
    expect(tabbable(container)).toHaveLength(1);
    expect(tabbable(container)[0].dataset.pvSlot).toBe('period');
  });

  it('上下キーで隣のブロックへ移り、tab の止まり先もそこへ移る', () => {
    const { container } = render(<ProjectPreview project={project()} company={undefined} no={1} />);
    const slots = slotsOf(container);
    const first = container.querySelector<HTMLElement>('[data-pv-slot="period"]');
    if (!first) throw new Error('先頭ブロックが無い');

    act(() => first.focus());
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(container.querySelector(`[data-pv-slot="${slots[1]}"]`));
    expect(tabbable(container)[0].dataset.pvSlot).toBe(slots[1]);

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(first);
  });

  it('End で末尾、Home で先頭へ飛ぶ', () => {
    const { container } = render(<ProjectPreview project={project()} company={undefined} no={1} />);
    const slots = slotsOf(container);
    const first = container.querySelector<HTMLElement>('[data-pv-slot="period"]');
    if (!first) throw new Error('先頭ブロックが無い');

    act(() => first.focus());
    fireEvent.keyDown(first, { key: 'End' });
    expect(document.activeElement).toBe(container.querySelector(`[data-pv-slot="${slots[slots.length - 1]}"]`));

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Home' });
    expect(document.activeElement).toBe(first);
  });

  it('移動先が重複せず、概要が空のときは概要スロットが移動先に入らない', () => {
    const withSummary = render(<ProjectPreview project={project()} company={undefined} no={1} />);
    const withSlots = slotsOf(withSummary.container);
    expect(new Set(withSlots).size).toBe(withSlots.length);
    expect(withSlots).toContain('summary');

    const emptySummary = render(<ProjectPreview project={project({ summary: '' })} company={undefined} no={1} />);
    const fbSlots = slotsOf(emptySummary.container);
    expect(new Set(fbSlots).size).toBe(fbSlots.length);
    expect(fbSlots).not.toContain('summary');
    expect(fbSlots).toContain('duties');
  });

  it('概要が空でも飛び先キーが重複しない', () => {
    // 飛び先キーが2箇所に出ると、編集欄→プレビューの追従が先に見つけた方へ
    // 走り、本来のブロックへ行かない。ハイライトも2箇所同時に点く。
    const { container } = render(<ProjectPreview project={project({ summary: '' })} company={undefined} no={1} />);
    const keys = Array.from(container.querySelectorAll<HTMLElement>('[data-sync-pv]')).map((el) => el.dataset.syncPv);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('クリックでも対応する編集欄へ飛ぶ', () => {
    const onJump = vi.fn();
    const { container } = render(<ProjectPreview project={project()} company={undefined} no={1} onJump={onJump} />);
    const tech = container.querySelector<HTMLElement>('[data-pv-slot="tech"]');
    if (!tech) throw new Error('技術ブロックが無い');

    fireEvent.click(tech);
    expect(onJump).toHaveBeenCalledWith('tech');
  });

  it('Space でも対応する編集欄へ飛ぶ', () => {
    const onJump = vi.fn();
    const { container } = render(<ProjectPreview project={project()} company={undefined} no={1} onJump={onJump} />);
    const scope = container.querySelector<HTMLElement>('[data-pv-slot="scope"]');
    if (!scope) throw new Error('スコープブロックが無い');

    fireEvent.keyDown(scope, { key: ' ' });
    expect(onJump).toHaveBeenCalledWith('scope');
  });

  it('左右キーでも隣のブロックへ移る', () => {
    const { container } = render(<ProjectPreview project={project()} company={undefined} no={1} />);
    const slots = slotsOf(container);
    const first = container.querySelector<HTMLElement>('[data-pv-slot="period"]');
    if (!first) throw new Error('先頭ブロックが無い');

    act(() => first.focus());
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(container.querySelector(`[data-pv-slot="${slots[1]}"]`));

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(first);
  });

  it('Enter で対応する編集欄へ飛ぶ', () => {
    const onJump = vi.fn();
    const { container } = render(<ProjectPreview project={project()} company={undefined} no={1} onJump={onJump} />);
    const title = container.querySelector<HTMLElement>('[data-pv-slot="title"]');
    if (!title) throw new Error('タイトルブロックが無い');

    fireEvent.keyDown(title, { key: 'Enter' });
    expect(onJump).toHaveBeenCalledWith('title');
  });
});

describe('非表示案件・リンク・受け口の維持', () => {
  it('非表示でも本文を薄めず、破線の枠とバッジで示す', () => {
    const view = render(<ProjectPreview project={project({ hidden: true })} company={undefined} no={1} />);
    expect(view.container.querySelector('.opacity-60')).toBeNull();
    expect(view.container.querySelector('.pv-card-hidden')).not.toBeNull();
    expect(view.getByText('閲覧側では非表示')).toBeInTheDocument();
  });

  it('本文中のリンクは tab の止まり先にならず、押しても編集欄へは飛ばない（#138）', () => {
    const onJump = vi.fn();
    const { container } = render(
      <ProjectPreview
        project={project({ summary: '詳細は[こちら](https://example.com/spec)。' })}
        company={undefined}
        no={1}
        onJump={onJump}
      />,
    );
    const link = container.querySelector<HTMLAnchorElement>('[data-pv-slot="summary"] a');
    if (!link) throw new Error('リンクが無い');
    expect(link.tabIndex).toBe(-1);
    expect(tabbable(container)).toHaveLength(1);
    // jsdom は画面遷移を実装しておらず、リンクを押すと警告を出すので、遷移だけ止める。
    link.addEventListener('click', (e) => e.preventDefault());
    fireEvent.click(link);
    expect(onJump).not.toHaveBeenCalled();
  });

  it('受け口にしていたブロックが消えても、tab の止まり先が先頭へ戻る', () => {
    const view = render(<ProjectPreview project={project()} company={undefined} no={1} />);
    const summary = view.container.querySelector<HTMLElement>('[data-pv-slot="summary"]');
    if (!summary) throw new Error('概要ブロックが無い');
    act(() => summary.focus());
    expect(tabbable(view.container)[0].dataset.pvSlot).toBe('summary');

    view.rerender(<ProjectPreview project={project({ summary: '' })} company={undefined} no={1} />);
    expect(tabbable(view.container)).toHaveLength(1);
    expect(tabbable(view.container)[0].dataset.pvSlot).toBe('period');
  });
});

describe('ProjectPreview の tab 停止位置（#658）', () => {
  // 飛び先ブロック自体も role=button で名前に同じ文字が入るため、getByRole では本物の <button> を特定できない。
  const readMore = (container: HTMLElement) => {
    const el = container.querySelector<HTMLButtonElement>('button[aria-expanded]');
    if (!el) throw new Error('続きを読むボタンが無い');
    return el;
  };

  const longComment = '1段落目。\n\n2段落目。\n\n3段落目。詳細は[こちら](https://example.com/spec)。\n\n4段落目。';

  it('プレビュー列の tabindex=0 は 1 つだけ', () => {
    const { container } = render(
      <ProjectPreview
        project={project({ comment: longComment, summary: '概要は[ここ](https://example.com/a)。' })}
        company={undefined}
        no={1}
      />,
    );
    // 「続きを読む」が出ている（3段落以上）ことを前提にしている。
    expect(readMore(container).textContent).toContain('続きを読む');
    expect(container.querySelectorAll('a[href]').length).toBeGreaterThan(0);
    expect(focusStops(container)).toHaveLength(1);
    expect(focusStops(container)[0].dataset.pvSlot).toBe('period');
  });

  it('「続きを読む」は tab で止まらないが、押せば展開される', () => {
    const { container } = render(
      <ProjectPreview project={project({ comment: longComment })} company={undefined} no={1} />,
    );
    const more = readMore(container);
    expect(more.tabIndex).toBe(-1);
    fireEvent.click(more);
    expect(container.textContent).toContain('4段落目。');
    expect(readMore(container).tabIndex).toBe(-1);
    expect(readMore(container).textContent).toBe('閉じる');
  });

  it('「続きを読む」を押しても編集欄へは飛ばない', () => {
    const onJump = vi.fn();
    const { container } = render(
      <ProjectPreview project={project({ comment: longComment })} company={undefined} no={1} onJump={onJump} />,
    );
    fireEvent.click(readMore(container));
    expect(onJump).not.toHaveBeenCalled();
  });

  it('空の項目には飛び先を出さない（プレースホルダを足さない）', () => {
    const { container } = render(
      <ProjectPreview
        project={project({
          scope: '',
          summary: '',
          duties: '',
          acquired: '',
          comment: '',
          process: [],
          tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] },
        })}
        company={undefined}
        no={1}
      />,
    );
    const slots = slotsOf(container);
    for (const empty of ['scope', 'summary', 'duties', 'acquired', 'comment', 'process', 'tech']) {
      expect(slots).not.toContain(empty);
    }
    expect(slots).toEqual(['period', 'title', 'meta']);
  });

  it('案内文は「表示されている項目をクリックすると…」で始まる', () => {
    const { container } = render(<ProjectPreview project={project()} company={undefined} no={1} />);
    expect(container.querySelector('.pv-hint')?.textContent?.startsWith('表示されている項目をクリックすると')).toBe(
      true,
    );
  });
});
