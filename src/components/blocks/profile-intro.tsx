'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { orderedProfileMetaEntries, type ProfileBlockData, resolveProfileMetaLabel } from '@/db/blocks';
import { sanitizeHtml } from '@/util/sanitize-html';

interface ProfileIntroProps {
  data: ProfileBlockData;
}

export const ProfileIntro = ({ data }: ProfileIntroProps) => {
  const [expanded, setExpanded] = useState(false);
  // 文字数ではなく実測（line-clamp 適用時に scrollHeight > clientHeight か）で判定する。
  // 改行区切りの短い自己PR（whitespace-pre-line で改行を保持）は文字数が少なくても
  // 表示行数を超えて隠れることがあるため、文字数しきい値では検出できない。
  const [isPrTruncated, setIsPrTruncated] = useState(false);
  const prRef = useRef<HTMLParagraphElement>(null);
  // 開閉ボタンから自己PR段落を aria-controls で指すための id。
  const prId = useId();
  // 既知8項目 → それ以外の任意項目、の順で並べる（src/db/blocks.ts と共有。
  // markdown/PDF 変換の並び順ともここで揃う。Issue #193）。
  const metaEntries = orderedProfileMetaEntries(data.meta);

  const measurePrTruncation = useCallback(() => {
    const el = prRef.current;
    // 展開中は line-clamp を外しているため常に非切り詰め判定になり、
    // トグルを隠す方向に誤爆する。展開中は直前の判定を維持する。
    if (!el || expanded) return;
    setIsPrTruncated(el.scrollHeight > el.clientHeight + 1);
  }, [expanded]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: data.pr 変更時の再測定に必要
  useEffect(() => {
    measurePrTruncation();
  }, [measurePrTruncation, data.pr]);

  // 幅が変わる（ウィンドウリサイズ・回転）と1行あたりの文字数が変わり、
  // 切り詰め有無も変わるため、幅の変化を ResizeObserver で拾って再測定する。
  useEffect(() => {
    const el = prRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measurePrTruncation);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measurePrTruncation]);

  // IBM Plex Sans JP は preload:false + display:swap（layout.tsx）のため、初回表示では
  // フォールバックフォントで折り返しが確定した後にWebフォントへ差し替わることがある。
  // line-clamp は要素自身の高さを既定行数に固定するため、この置き換えによる行数の変化は
  // ResizeObserver（要素の外形サイズの変化）だけでは検知できない。フォント読み込み完了時に
  // 明示的に再測定する。
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts?.ready) return;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) measurePrTruncation();
    });
    return () => {
      cancelled = true;
    };
  }, [measurePrTruncation]);

  // SP とデスクトップで視覚順が異なるため、display:none で切り替える二重描画にする。
  // CSS order だけでは DOM順（スクリーンリーダー・キーボードタブ順）が視覚順と
  // 食い違う。display:none は a11y ツリーからも外れるため、両ブレークポイントで
  // DOM順=視覚順を成立させられる（viewer-topbar.tsx と同じ方式。Issue #221）。
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(max-width: 639px)');
    const handleChange = () => measurePrTruncation();
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [measurePrTruncation]);

  const renderName = () => (
    // design は区切り線を持たず、親の 48px 間隔だけで次のセクションと分ける。
    <div className="flex flex-col gap-1">
      {/* kicker: 「SKILL SHEET · 会社名」。会社名未設定時は「SKILL SHEET」のみ。 */}
      <p className="kicker mb-1.5">{data.company ? `SKILL SHEET · ${sanitizeHtml(data.company)}` : 'SKILL SHEET'}</p>
      {data.name && (
        <h1 className="text-[26px] font-bold leading-[1.1] tracking-[-0.02em] text-foreground sm:text-[34px]">
          {sanitizeHtml(data.name)}
        </h1>
      )}
      {data.title && <p className="font-mono text-[14.5px] text-accent-text">{sanitizeHtml(data.title)}</p>}
    </div>
  );

  const renderMeta = () =>
    metaEntries.length > 0 ? (
      // design は「年齢 30代 · 勤務形態 フルリモート · …」の1行。2段組の定義リストはやめる。
      // SP は2列グリッド、sm 以上は1行フレックスに戻す。
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs text-faint sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-[18px]">
        {metaEntries.map(([key, value], i) => (
          // min-w-0: grid-cols-2 は各トラックを minmax(0,1fr) にするが、内側の flex 行自体は
          // 既定 min-width:auto のままだと、区切りの無い長い値（英字の資格名など）で
          // セルからはみ出し隣の列に重なる。break-words で折り返し可能にする。
          <div key={key} className="flex min-w-0 items-baseline gap-1.5">
            {i > 0 && (
              <span aria-hidden className="hidden sm:inline">
                ·
              </span>
            )}
            {/* shrink-0 でラベルを潰さないのが基本だが、Issue #193 で任意ラベルが
                許容されたため、長いラベル（`ProfessionalCertificationDetails` など）は
                flex-basis=max-content のままセル幅を超えて隣の列に重なる。
                max-w は flex の基準サイズをクランプするので、shrink-0 を保ったまま
                「短いラベルは絶対に折り返さない／長いラベルだけ半分で折り返す」を両立できる。 */}
            <dt className="max-w-[50%] shrink-0 break-words">{resolveProfileMetaLabel(key)}</dt>
            <dd className="min-w-0 break-words text-foreground">{sanitizeHtml(value)}</dd>
          </div>
        ))}
      </dl>
    ) : null;

  const renderStrengths = () =>
    data.strengths.length > 0 ? (
      <ul className="flex flex-wrap gap-2">
        {data.strengths.map((s, i) => (
          // 押せない紹介ラベルなので .techtag。
          // biome-ignore lint/suspicious/noArrayIndexKey: 静的リスト
          <li key={i} className="techtag">
            {sanitizeHtml(s)}
          </li>
        ))}
      </ul>
    ) : null;

  const renderPr = (variant: 'sp' | 'desktop') => {
    if (!data.pr) return null;
    const isSp = variant === 'sp';
    return (
      <>
        <p
          ref={isSp ? prRef : undefined}
          id={isSp ? prId : undefined}
          // line-clamp は SP 専用（sm 以上は続きを読むボタンを出さないため、常に全文表示に戻す）。
          // 行数を 6 にしているのは、自己PRが段落を空行で区切って保存され whitespace-pre-line で
          // その空行を保持するため。4行だと「本文2行＋空行1行＋本文1行」となり、fold 内の
          // 1/4 を区切りの空白に費やしたうえ2段落目が1行で切れて要旨が掴めなかった
          // （375px の実機で確認）。6行なら空行込みでも本文が5行残り、2段落目の要旨まで届く。
          className={`max-w-[720px] whitespace-pre-line text-sm leading-[1.95] text-foreground/80 ${
            isSp ? (expanded ? 'sm:line-clamp-none' : 'line-clamp-6 sm:line-clamp-none') : 'line-clamp-none'
          }`}
        >
          {sanitizeHtml(data.pr)}
        </p>
        {isSp && isPrTruncated && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={prId}
            // 開閉トグルなので min-h-11: SP 専用の操作でありながらタップ領域が
            // 文字高さ(約17px)しか無く、#192 で 44px を確保した他のボタンと不揃いだった。
            className="-mt-3 flex min-h-11 items-center self-start text-xs font-medium text-accent-text sm:hidden"
          >
            {expanded ? '折りたたむ' : '続きを読む'}
          </button>
        )}
      </>
    );
  };

  return (
    <section className="flex flex-col gap-4">
      {renderName()}
      {/* SP レイアウト: 氏名 → メタ → 強み → 自己PR */}
      <div data-testid="profile-intro-sp" className="block sm:hidden">
        <div className="flex flex-col gap-4">
          {renderMeta()}
          {renderStrengths()}
          {renderPr('sp')}
        </div>
      </div>
      {/* デスクトップ レイアウト: 氏名 → 自己PR → 強み → メタ */}
      <div data-testid="profile-intro-desktop" className="hidden sm:flex flex-col gap-4">
        {renderPr('desktop')}
        {renderStrengths()}
        {renderMeta()}
      </div>
    </section>
  );
};
