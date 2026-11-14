'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { ProjectCard, type ProjectCardRegion } from '@/component/block/project-card';
import type { CompanyInfo, ProjectItem } from '@/db/block';
import { currentMonthKey } from '@/db/derived-display';
import { flattenTech } from '@/db/process';

interface ProjectPreviewProps {
  project: ProjectItem;
  company: CompanyInfo | undefined;
  /**
   * 閲覧側での通し番号。非表示（自分または会社が hidden）の場合も
   * 「表示されたと仮定したときの番号」を渡す — カードの見た目を維持しつつ
   * バッジで非表示であることを明示する。
   */
  no: number;
  /** いま編集中の欄に対応するキー。この箇所を光らせる。 */
  syncKey?: string | null;
  /** プレビューのこの箇所をクリック → フォームの対応欄へ飛ぶ。 */
  onJump?: (syncKey: string) => void;
}

/** イベント発生元が sync() 要素自身ではなく、内側のリンク等インタラクティブ要素かどうか。 */
const isInteractiveDescendant = (currentTarget: EventTarget, target: EventTarget | null): boolean =>
  target instanceof Element &&
  target !== currentTarget &&
  Boolean(target.closest('a, button, input, select, textarea'));

/**
 * 右ペイン：ライブプレビュー。
 *
 * 閲覧画面と同じ案件カード（ProjectCard）をそのまま描く。別に描き直すと、月数の出し方や
 * 技術の並びが閲覧結果とずれる（編集者が確かめたつもりの画面と、相手が見る画面が違ってしまう）。
 * プレビューだけの機能（クリックで編集欄へ飛ぶ・編集中の欄を光らせる）は、カードの区画を
 * wrapRegion で外側から包んで足す。カード本体には閲覧画面向けの描画しか持たせない。
 * hidden（案件自身 or 所属会社）の場合は「閲覧側では非表示」バッジを添える。
 *
 * 同期ブロックは全体で1つの toolbar として扱う（roving tabindex）。
 * 個々のブロックを順に tab 可能にすると、プレビュー列を通り抜けるだけで
 * 案件の情報量ぶんの tab を押すことになり、キーボードだけで使う人が列の外へ出られない。
 * 列の中は上下キーで移動し、tab は列全体で1回だけ止まる。
 */
export const ProjectPreview = ({ project, company, no, syncKey, onJump }: ProjectPreviewProps) => {
  const hidden = Boolean(project.hidden || company?.hidden);
  const tech = flattenTech(project.tech);

  const toolbarRef = useRef<HTMLDivElement>(null);
  /** 上下キー移動でいま tab の受け口になっているスロット。null なら先頭（期間は常に描かれる）。 */
  const [focusSlot, setFocusSlot] = useState<string | null>(null);
  const activeSlot = focusSlot ?? 'period';

  // 受け口にしていたブロックが消えた（例: 概要を空にした）ら先頭へ戻す。
  // 受け口が無いと、プレビュー列に tab で入れなくなる。
  useEffect(() => {
    const el = toolbarRef.current;
    if (el && focusSlot && !el.querySelector(`[data-pv-slot="${focusSlot}"]`)) setFocusSlot(null);
  });

  /** クリックとキーボードの両方で飛べる同期ブロック。 */
  const sync = (key: string, slot: string = key) => ({
    className: `pv-sync${syncKey === key ? ' on' : ''}`,
    'data-sync-pv': key,
    'data-pv-slot': slot,
    role: 'button' as const,
    tabIndex: slot === activeSlot ? 0 : -1,
    title: '編集欄へ移動',
    onFocus: () => setFocusSlot(slot),
    // summary/duties/acquired/comment は InlineMarkdown を通すため、内側に <a> が
    // 出ることがある（#138）。role="button" のこの要素が Enter/クリックを奪うと、
    // リンクへフォーカスして Enter を押しても遷移せず編集欄へ飛んでしまう。
    // イベントの発生元が内側のリンク等インタラクティブ要素なら、飛び先へは移動しない。
    onClick: (e: React.MouseEvent) => {
      if (isInteractiveDescendant(e.currentTarget, e.target)) return;
      onJump?.(key);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (isInteractiveDescendant(e.currentTarget, e.target)) return;
      e.preventDefault();
      onJump?.(key);
    },
  });

  /** カードの区画を、編集欄への飛び先として包む。期間はカードの1行に収まるよう span にする。 */
  const wrapRegion = (region: ProjectCardRegion, node: ReactNode) =>
    region === 'period' ? <span {...sync(region)}>{node}</span> : <div {...sync(region)}>{node}</div>;

  /** 上下キーで巡る順序は、いま描かれている飛び先の DOM の並び（カードの描画順）そのもの。 */
  const moveFocus = (from: string, delta: number | 'first' | 'last') => {
    const targets = Array.from(toolbarRef.current?.querySelectorAll<HTMLElement>('[data-pv-slot]') ?? []);
    const at = targets.findIndex((el) => el.dataset.pvSlot === from);
    const next =
      delta === 'first'
        ? 0
        : delta === 'last'
          ? targets.length - 1
          : Math.min(Math.max(at + delta, 0), targets.length - 1);
    const target = targets[next];
    if (!target) return;
    setFocusSlot(target.dataset.pvSlot ?? null);
    target.focus();
  };

  const handleToolbarKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const from = (e.target as HTMLElement).closest<HTMLElement>('[data-pv-slot]')?.dataset.pvSlot;
    if (!from) return;
    const delta = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, Home: 'first', End: 'last' }[e.key] as
      | number
      | 'first'
      | 'last'
      | undefined;
    if (delta === undefined) return;
    e.preventDefault();
    moveFocus(from, delta);
  };

  return (
    <div className="preview-inner">
      <div className="flex items-center gap-2">
        <span className="kicker">Live Preview · 閲覧時の見え方</span>
        {hidden && <span className="pv-hidden">閲覧側では非表示</span>}
      </div>
      <p className="pv-hint">
        表示されている項目をクリックすると、その項目の編集欄へ移動します（上下キーでも選べます）。
      </p>
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-orientation="vertical"
        // 矢印キーは読み上げソフトの通常モードでは奪われて届かないので、案内には書かない。
        aria-label="プレビューの項目（Enter で編集欄へ移動）"
        onKeyDown={handleToolbarKeyDown}
      >
        <div className={`pv-card-host${hidden ? ' pv-card-hidden' : ''}`}>
          <ProjectCard
            item={project}
            no={no}
            companyName={company?.name}
            activeTech={[]}
            tech={tech}
            // 閲覧画面の案件カードと同じく、手入力が無ければ期間から月数を出す。
            // 基準月が無いと「現在」終わりの案件が「未確定」になるので、フォームの期間横の
            // 月数バッジ（durationFromRange）と同じ現在月で固定する。
            referenceMonth={currentMonthKey()}
            linksTabbable={false}
            wrapRegion={wrapRegion}
          />
        </div>
      </div>
    </div>
  );
};
