import type { ReactNode } from 'react';

interface SectionHeadProps {
  kicker: string;
  title: string;
  /** 見出しの右端に出す補足（件数など）。design では mono の小さい淡色。 */
  right?: ReactNode;
}

// ダッシュボードの各セクション見出し。意図的に id を付与しない
// （ToC はこの見出しを拾わず、markdown由来の見出しのみを一覧する）。
export function SectionHead({ kicker, title, right }: SectionHeadProps) {
  return (
    <div className="mb-[18px] flex items-end justify-between gap-4">
      <div>
        <p className="kicker">{kicker}</p>
        <h2 className="mt-1.5 text-[22px] text-foreground" style={{ fontWeight: 'var(--head-weight)' }}>
          {title}
        </h2>
      </div>
      {right && <span className="shrink-0 pb-1 font-mono text-[11.5px] text-faint">{right}</span>}
    </div>
  );
}
