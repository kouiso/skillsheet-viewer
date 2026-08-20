'use client';

import type { CompanyInfo, ProjectItem } from '@skillsheet/db/blocks';
import { flattenTech, normalizeProcess, PROCESS_LABELS } from '@skillsheet/db/process';
import { projectAreaText } from '@skillsheet/db/tech-area';
import { useRef, useState } from 'react';

import { InlineMarkdown } from '@/components/inline-markdown';
import { formatTeamSize } from '@/util/format-team-size';

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

/** 技術チップは多すぎると縦に伸びてカードの形が崩れるため、この件数で打ち切って残数を出す。 */
const MAX_TECH_CHIPS = 16;

/** イベント発生元が sync() 要素自身ではなく、内側のリンク等インタラクティブ要素かどうか。 */
const isInteractiveDescendant = (currentTarget: EventTarget, target: EventTarget | null): boolean =>
  target instanceof Element &&
  target !== currentTarget &&
  Boolean(target.closest('a, button, input, select, textarea'));

/**
 * 右ペイン：ライブプレビュー。
 *
 * 閲覧側の案件カードと同じ情報を、エディタ幅（396px）に収まる密度で再構成したもの。
 * 各ブロックはクリックでフォームの対応欄へ飛び、逆にフォームを編集すると光る（同期ジャンプ）。
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
  const shownTech = tech.slice(0, MAX_TECH_CHIPS);
  const process = normalizeProcess(project.process);
  /** 要約欄そのものに値がある（担当業務での代替ではない）。 */
  const hasOwnSummary = Boolean(project.summary?.trim());
  const summary = project.summary?.trim() || project.duties.trim();
  /** スコープ欄の値そのままか、空なら技術スタックからの導出値（由来を添える）。 */
  const ownScope = project.scope.trim();
  const derivedArea = ownScope ? '' : projectAreaText('', project.tech);
  const scopePreview = ownScope || (derivedArea ? `${derivedArea}（技術スタックから導出）` : 'スコープ未入力');

  const toolbarRef = useRef<HTMLDivElement>(null);
  /** 上下キー移動でいま tab の受け口になっているスロット。null なら先頭。 */
  const [focusSlot, setFocusSlot] = useState<string | null>(null);

  const textBlocks = (
    [
      ['duties', '≪担当業務≫', project.duties],
      ['acquired', '≪習得スキル・実績≫', project.acquired],
      ['comment', '≪コメント≫', project.comment],
    ] as const
  ).filter(([, , body]) => body.trim());

  /**
   * 上下キーで巡る順序。DOM の並びと一致させる。
   * 飛び先キー（data-sync-pv）とは別に「スロット」を持たせているのは、
   * 飛び先が同じでも移動先としては別物として数える必要があるため。
   */
  const slots = [
    'period',
    'title',
    'scope',
    'meta',
    ...(summary && hasOwnSummary ? ['summary'] : []),
    ...(shownTech.length > 0 ? ['tech'] : []),
    'process',
    ...textBlocks.map(([key]) => key as string),
  ];

  const activeSlot = focusSlot && slots.includes(focusSlot) ? focusSlot : slots[0];

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

  const moveFocus = (from: string, delta: number | 'first' | 'last') => {
    const at = slots.indexOf(from);
    const next =
      delta === 'first' ? 0 : delta === 'last' ? slots.length - 1 : Math.min(Math.max(at + delta, 0), slots.length - 1);
    const target = toolbarRef.current?.querySelector<HTMLElement>(`[data-pv-slot="${slots[next]}"]`);
    if (!target) return;
    setFocusSlot(slots[next]);
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
      <p className="pv-hint">各ブロックをクリックすると、その項目の編集欄へ移動します（上下キーでも選べます）。</p>
      <div
        ref={toolbarRef}
        role="toolbar"
        aria-orientation="vertical"
        // 矢印キーは読み上げソフトの通常モードでは奪われて届かないので、案内には書かない。
        aria-label="プレビューの項目（Enter で編集欄へ移動）"
        onKeyDown={handleToolbarKeyDown}
      >
        <div className={`pv-card${hidden ? ' opacity-60' : ''}`}>
          <div className="pv-top">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="pv-no">{no > 0 ? String(no).padStart(2, '0') : '––'}</span>
                <span {...sync('period')}>
                  <span className="pv-period">{project.period || '期間未入力'}</span>
                </span>
              </div>
              <div {...sync('title')}>
                <h3 className="pv-title">{project.title || '（無題の案件）'}</h3>
              </div>
              <div {...sync('scope')}>
                {/* 閲覧側と同じ導出を通す。編集画面のプレビューが閲覧結果と食い違うと、
                    未入力のまま公開して初めて表示が変わることに気づく（WYSIWYG を崩さない）。
                    ただし導出値には由来を添える。添えんと「入力欄は空やのに値が見える」状態になり、
                    クリックして飛んだ先の空欄との対応が分からん。 */}
                <div className="pv-scope">{scopePreview}</div>
              </div>
              {/* 会社概要文（#139）。閲覧側の project-card.tsx と同じ位置づけで出す。
                  空白のみの値は blocks.ts の projectBlockToMarkdown と同じく trim() 後に判定する。 */}
              {company?.note?.trim() && <div className="pv-company-note">{company.note.trim()}</div>}
            </div>
            <div {...sync('meta')}>
              <div className="pv-meta">
                {project.role || '役割未設定'}
                <div className="m2">
                  {[company?.name, project.team && formatTeamSize(project.team), project.duration]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            </div>
          </div>

          {/* 要約は summary 欄の値を優先し、空のときだけ担当業務で代替する。
              代替表示のときはクリックもキーボード移動も付けない。付けると飛び先キーが
              下の ≪担当業務≫ ブロックと重複し、編集欄からの追従が先に見つけた
              こちらへ走って、本来の担当業務ブロックへ行かなくなる。 */}
          {summary &&
            (hasOwnSummary ? (
              <div {...sync('summary')}>
                <InlineMarkdown content={summary} className="pv-summary" linksTabbable={false} />
              </div>
            ) : (
              <InlineMarkdown content={summary} className="pv-summary" linksTabbable={false} />
            ))}

          {shownTech.length > 0 && (
            <div {...sync('tech')}>
              <div className="pv-tech">
                {shownTech.map((t) => (
                  <span key={t}>{t}</span>
                ))}
                {tech.length > shownTech.length && <span>+{tech.length - shownTech.length}</span>}
              </div>
            </div>
          )}

          <div className="pv-proc-wrap">
            <div {...sync('process')}>
              <div className="pv-proc">
                {PROCESS_LABELS.map((label, i) => (
                  <div key={label} className="pp">
                    <span className="lbl" style={{ color: process.done[i] ? 'var(--accent-text)' : 'var(--faint)' }}>
                      {label}
                    </span>
                    <span className="bar" style={{ background: process.done[i] ? 'var(--primary)' : 'var(--track)' }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {textBlocks.map(([key, heading, body]) => (
          <div key={key} className="pv-block">
            <div {...sync(key)}>
              <div className="bt">{heading}</div>
              <InlineMarkdown content={body} className="bc" linksTabbable={false} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
