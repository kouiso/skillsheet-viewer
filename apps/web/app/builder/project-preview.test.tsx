import type { ProjectItem } from '@skillsheet/db/blocks';
import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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

  it('移動先が重複せず、要約が担当業務の代替表示のときは移動先に入らない', () => {
    const withSummary = render(<ProjectPreview project={project()} company={undefined} no={1} />);
    const withSlots = slotsOf(withSummary.container);
    expect(new Set(withSlots).size).toBe(withSlots.length);
    expect(withSlots).toContain('summary');

    const fallback = render(<ProjectPreview project={project({ summary: '' })} company={undefined} no={1} />);
    const fbSlots = slotsOf(fallback.container);
    expect(new Set(fbSlots).size).toBe(fbSlots.length);
    expect(fbSlots).not.toContain('summary');
    expect(fbSlots).toContain('duties');
  });

  it('要約が空でも飛び先キーが重複しない', () => {
    // 飛び先キーが2箇所に出ると、編集欄→プレビューの追従が先に見つけた方（要約ブロック）へ
    // 走り、本来の ≪担当業務≫ ブロックへ行かない。ハイライトも2箇所同時に点く。
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
