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

    const meta = container.querySelector('.pv-meta');
    expect(meta?.textContent).toContain('SE · D社 · 9名 · 9ヶ月');
    expect(meta?.textContent).toContain('役割');
    // 見出しの左右2枠（.pv-top）が残っていると役割の位置が案件ごとにずれる（#289）。
    expect(container.querySelector('.pv-top')).toBeNull();
  });

  it('役割が空でも編集欄への飛び先として「役割未設定」を残し、「役割」ラベルは出さない', () => {
    const { container } = render(<ProjectPreview project={project({ role: '' })} company={undefined} no={1} />);
    const meta = container.querySelector('[data-pv-slot="meta"]');
    expect(meta?.textContent).toContain('役割未設定');
    expect(container.querySelector('.pv-meta .kicker')).toBeNull();
  });
});

const tabbable = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-pv-slot]')).filter((el) => el.tabIndex === 0);

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

describe('非表示案件と技術の全文確認', () => {
  it('非表示でも本文を薄めず、展開操作は編集ジャンプを起こさない', () => {
    const onJump = vi.fn();
    const item = project({
      hidden: true,
      tech: {
        lang: Array.from({ length: 20 }, (_, i) => `技術${i + 1}`),
        fw: [],
        db: [],
        infra: [],
        tools: [],
        collab: [],
      },
    });
    const view = render(<ProjectPreview project={item} company={undefined} no={1} onJump={onJump} />);
    expect(view.container.querySelector('.opacity-60')).toBeNull();
    expect(view.container.querySelector('.pv-card-hidden')).not.toBeNull();
    expect(view.queryByText('技術20')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'すべての技術を表示（20件）' }));
    expect(view.getByText('技術20')).toBeVisible();
    expect(onJump).not.toHaveBeenCalled();
    view.rerender(<ProjectPreview project={{ ...item, id: 'p2' }} company={undefined} no={2} onJump={onJump} />);
    expect(view.queryByText('技術20')).toBeNull();
  });
});
