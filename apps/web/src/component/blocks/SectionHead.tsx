interface SectionHeadProps {
  kicker: string;
  title: string;
}

// ダッシュボードの各セクション見出し。意図的に id を付与しない
// （ToC はこの見出しを拾わず、markdown由来の見出しのみを一覧する）。
export function SectionHead({ kicker, title }: SectionHeadProps) {
  return (
    <div className="mb-4">
      <p className="kicker">{kicker}</p>
      <h2 className="mt-1 text-xl text-foreground" style={{ fontWeight: 'var(--head-weight)' }}>
        {title}
      </h2>
    </div>
  );
}
