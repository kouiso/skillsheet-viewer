/**
 * WCAG 2.x のコントラスト比を計測する e2e 共通ヘルパー（Issue #369）。
 *
 * 構成は 2 層:
 * - `relativeLuminance` / `contrastRatio` / `requiredTextRatio`
 *   …純粋な数値計算。DOM 計測の結果（実効 RGBA）を受けて Node 側で使う。
 * - `readContrastColors`
 *   …locator.evaluate / page.evaluate に渡してブラウザ内で実行する DOM 計測関数。
 *   Playwright は渡した関数を文字列化して送るため、これらは他の export や
 *   import した実行時値を参照しない自己完結コードにする必要がある。
 *   色の分解（canvas）・祖先走査・半透明合成の小道具は各関数の内側に置く。
 */

/** [r, g, b] は 0–255、a は 0–1。 */
export type Rgba = readonly [number, number, number, number];

/** sRGB 値から WCAG 相対輝度を返す。alpha は見ない（先に実効色へ合成してから渡す）。 */
export function relativeLuminance([r, g, b]: Rgba): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** 2 色の WCAG コントラスト比（1〜21）。alpha は見ない。 */
export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return la >= lb ? (la + 0.05) / (lb + 0.05) : (lb + 0.05) / (la + 0.05);
}

/**
 * 文字の WCAG AA しきい値。
 * 大きい文字（18pt=24px 以上、または太字で 14pt≈18.66px 以上）は 3:1、
 * それ以外の本文・メタ文字は 4.5:1（SC 1.4.3）。
 */
export function requiredTextRatio(fontSizePx: number, fontWeight: number): number {
  const large = fontSizePx >= 24 || (fontWeight >= 700 && fontSizePx >= 18.66);
  return large ? 3 : 4.5;
}

/** 未対応の描画効果は計測成功として扱わず、呼び出し側のゲートで失敗させる。 */
export interface UnsupportedPaint {
  path: string;
  reason: string;
}

/** readContrastColors() が返す、1 要素ぶんの計測結果。比較としきい値判定は Node 側で行う。 */
export interface TextColorSample {
  /** 人が読める簡易パス（tag#id / tag.class を親 2 段まで連結） */
  path: string;
  /** 先頭 40 文字のスニペット（空白正規化済み） */
  text: string;
  fontSize: number;
  fontWeight: number;
  /** 実効文字色（alpha・祖先 opacity を bg へ合成済み・不透明） */
  color: Rgba;
  /** 実効背景色（祖先の背景層を合成済み・不透明） */
  background: Rgba;
  /** 全背景層が透明で UA canvas（白）仮定に落ちたか。ログの解釈用。 */
  assumedBase: boolean;
}

export interface TextColorReadResult {
  unsupported: UnsupportedPaint[];
  background: Rgba | null;
  borders: { side: string; color: Rgba | null }[];
  /** 計測できたテキスト要素数（セレクタ枯れの vacuous pass 防止に使う） */
  measured: number;
  samples: TextColorSample[];
}

/**
 * 画面内の「直接のテキストノードを持つ可視要素」をすべて走査し、実効文字色・
 * 実効背景色・書体メトリクスを返す。page.evaluate(readContrastColors) で使う。
 * 画像内の文字・svg は対象外、0 サイズ（sr-only 等）や祖先の display:none /
 * visibility:hidden / opacity:0 はスキップする。自己完結（evaluate 転送）。
 */
// Playwright の evaluate(fn, arg) は arg を省略できないため、引数は nullable にして
// 呼び出し側で undefined を渡す形にする（型付きオーバーロードに合わせるため）。
export function readContrastColors(root: Element | null | undefined): TextColorReadResult {
  const scope: ParentNode = root ?? document.body;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('色の計測用Canvasを作成できません');

  const parse = (css: string): [number, number, number, number] | null => {
    if (!css || css === 'transparent' || !CSS.supports('color', css)) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const compositeOver = (
    fg: readonly [number, number, number, number],
    bg: readonly [number, number, number, number],
  ): [number, number, number, number] => {
    const a = fg[3] + bg[3] * (1 - fg[3]);
    if (a <= 0) return [0, 0, 0, 0];
    const mix = (i: number) => (fg[i] * fg[3] + bg[i] * bg[3] * (1 - fg[3])) / a;
    return [mix(0), mix(1), mix(2), a];
  };
  // 子孫の描画を親の背景へ合成してから、そのグループ全体に親の opacity を
  // 一度だけ適用する。各層へ祖先 opacity の積を配ると背景と文字を二重に薄める。
  const transparent: Rgba = [0, 0, 0, 0];
  const effectiveColors = (
    el: Element,
    paint: string,
  ): { color: Rgba; background: Rgba; assumedBase: boolean } | { reason: string } => {
    let background: Rgba = transparent;
    let color: Rgba = parse(paint) ?? transparent;
    for (let e: Element | null = el; e; e = e.parentElement) {
      const st = getComputedStyle(e);
      const effects = [
        ['background-image', st.backgroundImage, 'none'],
        ['filter', st.filter, 'none'],
        ['backdrop-filter', st.backdropFilter, 'none'],
        ['mix-blend-mode', st.mixBlendMode, 'normal'],
        ['mask-image', st.maskImage, 'none'],
      ];
      for (const [property, value, normal] of effects) {
        // 子の不透明面で隠れていれば祖先の背景画像・背景ぼかしは結果に寄与しない。
        if ((property === 'background-image' || property === 'backdrop-filter') && background[3] >= 1) continue;
        if (value && value !== normal) return { reason: `${property}: ${value}` };
      }
      const bg = st.display === 'contents' ? transparent : (parse(st.backgroundColor) ?? transparent);
      background = compositeOver(background, bg);
      color = compositeOver(color, bg);
      // display:contents は自身のボックスを描画しないため opacity も作用しない。
      const opacity = st.display === 'contents' ? 1 : Number.parseFloat(st.opacity);
      background = [background[0], background[1], background[2], background[3] * opacity];
      color = [color[0], color[1], color[2], color[3] * opacity];
    }
    const canvasBase: Rgba = [255, 255, 255, 1];
    return {
      color: compositeOver(color, canvasBase),
      background: compositeOver(background, canvasBase),
      assumedBase: background[3] < 1,
    };
  };

  const pathOf = (el: Element) => {
    const parts: string[] = [];
    for (let e: Element | null = el, d = 0; e && e !== document.body && d < 3; e = e.parentElement, d++) {
      let part = e.tagName.toLowerCase();
      if (e.id) {
        parts.unshift(`${part}#${e.id}`);
        break;
      }
      const cls = (e.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) part += `.${cls.join('.')}`;
      parts.unshift(part);
    }
    return parts.join(' > ');
  };

  // fill/stroke 駆動で color を見ても意味がない領域、レンダリングされない領域、
  // 装飾用途で読み上げ対象外に指定された領域（SC 1.4.3 は装飾・偶発的な文字を除外する）。
  const SKIP_SELECTOR = 'svg,script,style,noscript,template,select,option,head,[aria-hidden="true"]';
  const samples: TextColorSample[] = [];
  const unsupported: UnsupportedPaint[] = [];
  const borders: { side: string; color: Rgba | null }[] = [];
  let borderBackground: Rgba | null = null;
  if (root) {
    const st = getComputedStyle(root);
    for (const side of ['top', 'right', 'bottom', 'left']) {
      const width = Number.parseFloat(st.getPropertyValue(`border-${side}-width`));
      const lineStyle = st.getPropertyValue(`border-${side}-style`);
      const result = effectiveColors(root, st.getPropertyValue(`border-${side}-color`));
      // border-box 以外では境界線の下に自身の背景が無い。未対応の合成を推測しない。
      const reason =
        'reason' in result
          ? result.reason
          : st.backgroundClip !== 'border-box'
            ? `background-clip: ${st.backgroundClip}`
            : null;
      if (reason) {
        unsupported.push({ path: pathOf(root), reason });
        borders.push({ side, color: null });
      } else if ('color' in result) {
        borderBackground = result.background;
        borders.push({
          side,
          color: width < 1 || lineStyle === 'none' || lineStyle === 'hidden' ? null : result.color,
        });
      }
    }
  }
  const elements = root ? [root, ...scope.querySelectorAll('*')] : [...scope.querySelectorAll('*')];
  for (const el of elements) {
    if (el.closest(SKIP_SELECTOR)) continue;
    // 直接のテキストノードだけ見る — 子要素に含まれる文字は子側で計測するので
    // これで画面内の可視テキストを重複なく網羅できる。
    let hasText = false;
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
        hasText = true;
        break;
      }
    }
    if (!hasText) continue;

    const htmlEl = el as HTMLElement;
    // display:none・visibility:hidden・opacity:0（祖先含む）をまとめて弾く。
    if (typeof htmlEl.checkVisibility === 'function') {
      if (!htmlEl.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    } else {
      // 古いブラウザ向けフォールバック（実際は Chromium のみで動かす想定）。
      let hidden = false;
      for (let e: Element | null = el; e; e = e.parentElement) {
        const st = getComputedStyle(e);
        if (st.display === 'none' || st.visibility === 'hidden' || st.visibility === 'collapse') {
          hidden = true;
          break;
        }
      }
      if (hidden) continue;
    }

    // sr-only のような 0 サイズクリップと、負のオフセットで画面外へ追い出された
    // テキスト（text-indent 系）は矩形で弾く。折り返しより下の本文は rect.top が
    // 大きいだけで右・下端は正なので対象に残る。
    const range = document.createRange();
    let hasVisibleText = false;
    for (const node of el.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0) {
        hasVisibleText = true;
        break;
      }
    }
    if (!hasVisibleText) continue;

    const st = getComputedStyle(el);
    const weightRaw = Number.parseFloat(st.fontWeight);
    const fontWeight = Number.isFinite(weightRaw) ? weightRaw : st.fontWeight === 'bold' ? 700 : 400;
    const result = effectiveColors(el, st.color);
    if ('reason' in result) {
      unsupported.push({ path: pathOf(el), reason: result.reason });
      continue;
    }
    const { color, background, assumedBase } = result;
    samples.push({
      path: pathOf(el),
      text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40),
      fontSize: Number.parseFloat(st.fontSize),
      fontWeight,
      color,
      background,
      assumedBase,
    });
  }
  return { measured: samples.length, samples, unsupported, background: borderBackground, borders };
}
