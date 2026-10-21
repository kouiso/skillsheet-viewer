'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import type { MouseEvent } from 'react';

import type { CompanyInfo } from '@/db/block';
import { companyDisplayName } from '@/db/group-by-company';
import { formatMonthToken, parseStart, splitPeriodRange } from '@/db/process';

export interface JumpCompanyInput {
  companyId: string;
  company: CompanyInfo | undefined;
  count: number;
}

export interface JumpCompanyItem {
  href: string;
  name: string;
  qual: string;
  count: number;
}

/**
 * ジャンプ先の id は CompanySection 側と同じ規則で作る。project ブロックが 2 つある
 * シートでは同じ会社 ID が両方に出うるので、接尾辞まで含めて一致させないと後のブロックの
 * リンクが前のブロックへ飛ぶ。
 */
export function buildCompanyJumpItems(groups: JumpCompanyInput[], headingIdSuffix = ''): JumpCompanyItem[] {
  const names = groups.map((group) => companyDisplayName(group.company));
  const nameCount = new Map<string, number>();
  for (const name of names) nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  return groups.map((group, index) => {
    const name = names[index];
    const dup = (nameCount.get(name) ?? 0) > 1;
    const period = group.company?.period ?? '';
    const [startToken] = splitPeriodRange(period);
    const start = parseStart(period);
    const qual = dup && start !== null ? `${formatMonthToken(startToken)}—` : '';
    return {
      href: `#company-${group.companyId}${headingIdSuffix}`,
      name,
      qual,
      count: group.count,
    };
  });
}

/**
 * ルートレイアウトが <base href="<origin>/"> を差し込むため（app/layout.tsx・#167）、"#company-…" だけの
 * href は "/#company-…" に解決され、押すと閲覧画面を離れてシート一覧へ移っていた。
 * 左クリックはこのページのハッシュだけを変える。修飾キー付き（新しいタブ等）はブラウザに任せる。
 */
function jumpWithinPage(event: MouseEvent<HTMLAnchorElement>, hash: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (window.location.hash === hash) {
    // 同じハッシュを入れ直してもブラウザはスクロールしないので、同じ会社をもう一度押した時は自分で寄せる。
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
    return;
  }
  window.location.hash = hash;
}

export function CompanyJumpNav({ groups, headingIdSuffix }: { groups: JumpCompanyInput[]; headingIdSuffix?: string }) {
  // 新しいタブで開いた時も同じシートを開くよう、href は今のパスとクエリ付きにする。
  // 閲覧画面はシートをパスで選ぶ。ビルダー（版の履歴の全体プレビュー）は ?sheet= で選ぶ。クエリを落とすと既定のシートが開く。
  // ビルダーの新しいタブは版の履歴を開き直さない。会社の見出しまで着くのは閲覧画面だけ。
  const pathname = usePathname();
  const query = useSearchParams()?.toString() ?? '';
  const pageHref = pathname ? `${pathname}${query ? `?${query}` : ''}` : '';
  const items = buildCompanyJumpItems(groups, headingIdSuffix ?? '');
  if (items.length === 0) return null;
  return (
    <nav aria-label="会社別ジャンプ" className="company-jump-nav mb-5">
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-[13px] leading-normal text-muted-foreground">
          会社から探す
          <span className="ml-2 font-mono text-[12px]">{items.length} 社</span>
        </summary>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {items.map((item) => (
            <a
              key={item.href}
              href={`${pageHref}${item.href}`}
              onClick={(event) => jumpWithinPage(event, item.href)}
              className="inline-flex min-h-11 max-w-full items-baseline gap-1.5 whitespace-nowrap rounded border border-border-strong bg-card px-2.5 py-2 text-[13px] leading-normal text-foreground hover:border-primary hover:text-accent-text"
              title={item.name}
            >
              {/* 長い社名でもページ横スクロールを起こさないよう、チップ幅を抑えて省略する */}
              <span className="min-w-0 truncate">{item.name}</span>
              {item.qual ? <span className="font-mono text-[12px] text-muted-foreground">{item.qual}</span> : null}
              <span className="font-mono text-[12px] text-muted-foreground">{item.count}</span>
            </a>
          ))}
        </div>
      </details>
    </nav>
  );
}
