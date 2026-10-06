/** 認証フォームの登場アニメーション中は境界の確定色を測らない。evaluate転送用。 */
export function hasStableOpaquePaint(element: Element): boolean {
  for (let current: Element | null = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (style.display !== 'contents' && Number.parseFloat(style.opacity) !== 1) return false;
    // 子孫/兄弟の無限の背景装飾は待たず、対象と祖先に作用する有限モーションだけ待つ。
    if (
      current.getAnimations().some((animation) => {
        const timing = animation.effect?.getTiming();
        return (
          timing?.iterations !== Number.POSITIVE_INFINITY &&
          (animation.pending || (animation.playState !== 'finished' && animation.playState !== 'idle'))
        );
      })
    )
      return false;
  }
  return true;
}
