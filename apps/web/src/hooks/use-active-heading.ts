import { type RefObject, useEffect, useState } from 'react';

/**
 * スクロール位置に基づいて現在アクティブな見出しIDを追跡するフック。
 *
 * `rootRef` を渡すと見出し要素の探索をそのコンテナ配下に限定する。
 * 比較モードでは2つのビューアが同一スラッグ（同名見出し→同一ID）を持ちうるため、
 * document 全体から `getElementById` で引くと別ビューアの要素を掴んでしまう。
 * インスタンスごとの `rootRef` 配下に scope することで干渉を防ぐ。
 * `rootRef` 未指定時は従来どおり document 全体から ID で探索する。
 */
export const useActiveHeading = (headingIds: string[], rootRef?: RefObject<HTMLElement | null>) => {
  const [activeId, setActiveId] = useState<string>('');

  // rootRef は ref オブジェクトなので参照は安定しており、effect の依存に含めても
  // 再実行を誘発しない（.current の変化では再実行されない点に留意）。
  useEffect(() => {
    if (headingIds.length === 0) return;

    // rootRef 配下に scope された見出し要素を ID で引く。
    // 未指定時は document 全体から引く（従来挙動）。
    const root = rootRef?.current;
    // 比較モードでは同一 ID が両ビューアに存在しうるため、root 配下を一度だけ走査して
    // ID→要素のマップを作り、そこから引く（CSS 特殊文字を含む ID でも安全）。
    const scopedById = root
      ? new Map(Array.from(root.querySelectorAll<HTMLElement>('[id]')).map((el) => [el.id, el]))
      : null;
    const findElement = (id: string): HTMLElement | null =>
      scopedById ? (scopedById.get(id) ?? null) : document.getElementById(id);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        rootMargin: '-100px 0px -66% 0px',
        threshold: 0,
      },
    );

    // 各見出し要素を監視
    const observed: HTMLElement[] = [];
    headingIds.forEach((id) => {
      const element = findElement(id);
      if (element) {
        observer.observe(element);
        observed.push(element);
      }
    });

    return () => {
      observed.forEach((element) => {
        observer.unobserve(element);
      });
    };
  }, [headingIds, rootRef]);

  return activeId;
};
