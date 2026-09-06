/**
 * 詳細版カードのページ割りに関わる props を、要素ツリーを直接読んで固定する。
 *
 * 描画（renderToBuffer）はしない — jsdom 側では @react-pdf の実描画を禁じているため
 * （CLAUDE.md）。ここで見たいのは「どの View にどのページ割り指定が乗っているか」だけで、
 * それはコンポーネントが返す要素ツリーを歩けば確認できる。
 */
import { isValidElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { createSpanTracker } from './print-primitives';
import type { PrintProject } from './print-view-model';
import { ProjectCardDetail } from './project-card-detail';

function project(overrides: Partial<PrintProject> = {}): PrintProject {
  return {
    id: 'p1',
    index: 1,
    title: '案件タイトル',
    companyName: 'A 社',
    companyLabel: 'A 社',
    periodText: '2025.01〜2025.06',
    compactPeriodText: '2025.01–06',
    durationText: '6ヶ月',
    team: '5 名',
    metaRows: [{ label: '役割', value: 'バックエンド' }],
    techGroups: [],
    duties: '業務内容の本文。',
    acquired: '',
    comment: 'コメントの本文。',
    compactNote: '',
    level: 'detail',
    fitsOnePage: true,
    estimatedHeight: 400,
    ...overrides,
  };
}

interface ElementLike {
  props: Record<string, unknown> & { children?: ReactNode };
}

/** React の要素のうち、props を読める形のものか。 */
function isElementLike(node: unknown): node is ElementLike {
  return isValidElement(node) && typeof node.props === 'object' && node.props !== null;
}

/** 要素ツリーを深さ優先で平坦化する（条件分岐で false / null になった枝は落ちる）。 */
function flatten(node: ReactNode): ElementLike[] {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!isElementLike(node)) return [];
  return [node, ...flatten(node.props.children)];
}

function render(overrides: Partial<PrintProject> = {}, splitAcrossPages?: boolean): ElementLike[] {
  const tree = ProjectCardDetail({
    project: project(overrides),
    spanTracker: createSpanTracker(),
    splitAcrossPages,
  });
  return flatten(tree);
}

describe('ProjectCardDetail のページ割り指定', () => {
  it('コメントブロックで強制改ページしない（残り高さを見ない break は使わない）', () => {
    // 以前は 1 ページに収まらないカードで無条件に break していて、直前のページが
    // 3 行だけで終わることがあった（実測: 53 ページ版の p13）。
    const nodes = render({ fitsOnePage: false });
    expect(nodes.filter((n) => n.props.break === true)).toEqual([]);
  });

  it('余白を要求する分割禁止の単位はヘッダーだけ（本文ブロックには足さない）', () => {
    // 本文ブロックの中に minPresenceAhead を持つ子を足すと、見出しが次ページへ送られた
    // ときにブロックの枠だけが前のページに空の箱として残る（実測、ファイル内コメント参照）。
    const nodes = render({ fitsOnePage: false });
    const guarded = nodes.filter((n) => n.props.wrap === false && typeof n.props.minPresenceAhead === 'number');
    expect(guarded).toHaveLength(1);
    expect(guarded[0].props.minPresenceAhead).toBe(80);
  });

  it('1 ページに収まるカードは分割禁止のまま描く', () => {
    const [card] = render({ fitsOnePage: true });
    expect(card.props.wrap).toBe(false);
  });

  it('splitAcrossPages を立てると、1 ページに収まるカードでも分割を許す', () => {
    // 会社見出しと同居できない大きさのカードで呼び出し側が立てる。分割禁止のままだと
    // カードが丸ごと次ページへ飛び、見出しだけのページが残る（実測: 53 ページ版の p42）。
    const [card] = render({ fitsOnePage: true }, true);
    expect(card.props.wrap).toBe(true);
  });
});
