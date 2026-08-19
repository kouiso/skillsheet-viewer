import type { ReactNode } from 'react';

interface SectionHeadProps {
  kicker: string;
  title: string;
  /** 見出しの右端に出す補足（件数など）。design では mono の小さい淡色。 */
  right?: ReactNode;
}

/**
 * kicker（英語の短いラベル）から見出しの id を作る。
 * 日本語の title から作ると URL に載せづらく、表記ゆれで id が変わってしまうため kicker を使う。
 */
export function sectionHeadId(kicker: string): string {
  return `section-${kicker
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;
}

/**
 * ダッシュボードの各セクション見出し。
 *
 * 以前は「ToC は markdown 由来の見出しだけを一覧する」という理由で id を付けていなかった。
 * しかし ToC は DOM から `h1..h6[id]` を拾う実装なので、id が無いダッシュボード型のシートでは
 * 目次が丸ごと出ず、7000px を超えるページを手でスクロールするしかなかった。
 * kicker 由来の安定した id を振り、ダッシュボード型でも目次が出るようにする。
 */
export function SectionHead({ kicker, title, right }: SectionHeadProps) {
  return (
    <div className="mb-[18px] flex items-end justify-between gap-4">
      <div>
        <p className="kicker">{kicker}</p>
        <h2
          id={sectionHeadId(kicker)}
          className="mt-1.5 text-[22px] text-foreground"
          style={{ fontWeight: 'var(--head-weight)' }}
        >
          {title}
        </h2>
      </div>
      {right && <span className="shrink-0 pb-1 font-mono text-[11.5px] text-faint">{right}</span>}
    </div>
  );
}
