'use client';

import type { CompanyInfo } from '@/db/blocks';
import { formatMonthToken, splitPeriodRange } from '@/db/process';

export interface JumpTarget {
  id: string;
  company: CompanyInfo | undefined;
  companyId: string;
  itemCount: number;
}

interface CompanyJumpNavProps {
  targets: JumpTarget[];
}

// app/layout.tsx が <base href="{origin}/"> を注入している（Basic 認証つきトンネルで
// document.baseURI から認証情報を外すため）。<base> があると `href="#id"` は
// 「現在のページ + ハッシュ」ではなく「オリジン直下 + ハッシュ」に解決され、
// 閲覧画面から / へ飛ばされてシートを見失う。実機で踏んだ。
// そのため既存の目次（skill-sheet-viewer.tsx の scrollToHeading）と同じく
// button + 自前スクロールにする。
// 見出しが sticky topbar に潜らないよう空ける余白。topbar の実測高さは
// viewer-topbar.tsx が --viewer-topbar-h として公開している（SP では2段になり倍近く変わる）。
const HEADROOM = 16;
const FALLBACK_TOPBAR_HEIGHT = 64;

function scrollOffset(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--viewer-topbar-h');
  const height = Number.parseFloat(raw);
  return (Number.isFinite(height) ? height : FALLBACK_TOPBAR_HEIGHT) + HEADROOM;
}

function jumpTo(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  const y = element.getBoundingClientRect().top + window.scrollY - scrollOffset();
  window.scrollTo({ top: y, behavior: 'smooth' });
  // アンカーなら移動していたはずのフォーカスを自前で送る。
  // これが無いとキーボード利用者は飛んだ先ではなくナビの続きを Tab し続けることになる。
  element.focus({ preventScroll: true });
}

/**
 * 「会社から探す」ジャンプナビ。同名の会社（実データでは「受託」が4回登場する）は
 * companyId 単位で別セクションのまま残すため（マージしない、プランの判断参照）、
 * ナビ上では名前だけでは見分けられない。開始年月を添えて区別する。
 */
export function CompanyJumpNav({ targets }: CompanyJumpNavProps) {
  if (targets.length === 0) return null;

  const nameCounts = new Map<string, number>();
  for (const t of targets) {
    const name = t.company?.name ?? '(不明な会社)';
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  return (
    <nav aria-label="会社別ジャンプ" className="mb-5">
      <details open className="group">
        <summary className="cursor-pointer select-none py-1.5 text-[13px] text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          会社から探す　<span className="font-mono text-[11px]">{targets.length} 社</span>
        </summary>
        <div className="flex flex-wrap gap-1.5 pb-0.5 pt-1.5">
          {targets.map((t) => {
            const name = t.company?.name ?? '(不明な会社)';
            const dup = (nameCounts.get(name) ?? 0) > 1;
            const [startToken] = splitPeriodRange(t.company?.period ?? '');
            const qual = dup && startToken ? `${formatMonthToken(startToken)}—` : '';
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => jumpTo(t.id)}
                className="inline-flex min-h-11 items-baseline gap-1.5 whitespace-nowrap rounded bg-card px-2.5 py-2 text-[13px] text-foreground hover:text-accent-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                style={{ border: '1px solid var(--border-strong)' }}
              >
                <span>{name}</span>
                {qual && <span className="font-mono text-[11px] text-muted-foreground">{qual}</span>}
                <span className="font-mono text-[11px] text-muted-foreground">{t.itemCount}</span>
              </button>
            );
          })}
        </div>
      </details>
    </nav>
  );
}
