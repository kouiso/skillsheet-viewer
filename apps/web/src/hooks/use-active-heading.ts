import { useState, useEffect } from 'react';

/**
 * スクロール位置に基づいて現在アクティブな見出しIDを追跡するフック
 */
export const useActiveHeading = (headingIds: string[]) => {
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    if (headingIds.length === 0) return;

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
    headingIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => {
      headingIds.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
          observer.unobserve(element);
        }
      });
    };
  }, [headingIds]);

  return activeId;
};
