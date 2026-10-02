/**
 * WCAG 2.x のコントラスト比を計測する e2e 共通ヘルパー（Issue #369）。
 *
 * 構成は 2 層:
 * - `relativeLuminance` / `contrastRatio` / `requiredTextRatio`
 *   …純粋な数値計算。DOM 計測の結果（実効 RGBA）を受けて Node 側で使う。
 * - `readBorderColors` / `readTextColors`
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

/** locator.evaluate() に渡す、入力要素の境界色・実効背景色の読み取り結果。 */
export interface BorderColors {
  /** 要素自身〜祖先の background-color を合成した実効背景（不透明）。分解不能時は null。 */
  background: Rgba | null;
  /** 4辺ぶん。幅 1px 未満・none/hidden の辺は color:null（旧実装どおり 0 扱いにする）。 */
  borders: { side: string; color: Rgba | null }[];
}

/**
 * 要素の border 4 辺と実効背景色を読み取る。半透明色は実効色へ合成する
 * （旧 borderContrast は半透明で throw していた）。背景側は祖先の背景層と
 * opacity を考慮する。evaluate 転送のため自己完結。
 */
export function readBorderColors(element: Element): BorderColors {
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
  // el から html まで遡り、各層の background-color を「その層とその祖先の
  // opacity を掛けた実効 α」で上から順に合成する。最初の不透明層で打ち切り、
  // 全て透明なら UA の canvas 色（白）を下敷きにする。
  const effectiveBackground = (el: Element): [number, number, number, number] | null => {
    const chain: Element[] = [];
    for (let e: Element | null = el; e; e = e.parentElement) chain.push(e);
    const styles = chain.map((e) => getComputedStyle(e));
    // chain[i] とその祖先すべての opacity 積（i 以降の suffix 積）
    const suffix = new Array<number>(chain.length).fill(1);
    let acc = 1;
    for (let i = chain.length - 1; i >= 0; i--) {
      const op = Number.parseFloat(styles[i].opacity);
      acc *= Number.isFinite(op) ? op : 1;
      suffix[i] = acc;
    }
    const layers: [number, number, number, number][] = [];
    let bottom: [number, number, number, number] = [255, 255, 255, 1];
    for (let i = 0; i < chain.length; i++) {
      if (styles[i].display === 'contents') continue;
      const parsed = parse(styles[i].backgroundColor);
      if (!parsed || parsed[3] <= 0) continue;
      const a = parsed[3] * suffix[i];
      if (a <= 0) continue;
      if (a >= 1) {
        bottom = [parsed[0], parsed[1], parsed[2], 1];
        break;
      }
      layers.push([parsed[0], parsed[1], parsed[2], a]);
    }
    let bg = bottom;
    for (let i = layers.length - 1; i >= 0; i--) bg = compositeOver(layers[i], bg);
    return [bg[0], bg[1], bg[2], 1];
  };

  const style = getComputedStyle(element);
  const background = effectiveBackground(element);
  const borders = (['top', 'right', 'bottom', 'left'] as const).map((side) => {
    const width = Number.parseFloat(style.getPropertyValue(`border-${side}-width`));
    const lineStyle = style.getPropertyValue(`border-${side}-style`);
    if (width < 1 || lineStyle === 'none' || lineStyle === 'hidden') return { side, color: null };
    const parsed = parse(style.getPropertyValue(`border-${side}-color`));
    if (!parsed || !background) return { side, color: null };
    const color = compositeOver(parsed, background);
    return { side, color: [color[0], color[1], color[2], 1] as Rgba };
  });
  return { background, borders };
}

/** readTextColors() が返す、1 要素ぶんの計測結果。比較としきい値判定は Node 側で行う。 */
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
  /** 計測できたテキスト要素数（セレクタ枯れの vacuous pass 防止に使う） */
  measured: number;
  samples: TextColorSample[];
}

/**
 * 画面内の「直接のテキストノードを持つ可視要素」をすべて走査し、実効文字色・
 * 実効背景色・書体メトリクスを返す。page.evaluate(readTextColors) で使う。
 * 画像内の文字・svg は対象外、0 サイズ（sr-only 等）や祖先の display:none /
 * visibility:hidden / opacity:0 はスキップする。自己完結（evaluate 転送）。
 */
// Playwright の evaluate(fn, arg) は arg を省略できないため、引数は nullable にして
// 呼び出し側で undefined を渡す形にする（型付きオーバーロードに合わせるため）。
export function readTextColors(root: Element | null | undefined): TextColorReadResult {
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
  const effectiveColors = (el: Element) => {
    const chain: Element[] = [];
    for (let e: Element | null = el; e; e = e.parentElement) chain.push(e);
    const styles = chain.map((e) => getComputedStyle(e));
    const suffix = new Array<number>(chain.length).fill(1);
    let acc = 1;
    for (let i = chain.length - 1; i >= 0; i--) {
      const op = Number.parseFloat(styles[i].opacity);
      acc *= Number.isFinite(op) ? op : 1;
      suffix[i] = acc;
    }
    const layers: [number, number, number, number][] = [];
    let bottom: [number, number, number, number] = [255, 255, 255, 1];
    let assumedBase = true;
    for (let i = 0; i < chain.length; i++) {
      if (styles[i].display === 'contents') continue;
      const parsed = parse(styles[i].backgroundColor);
      if (!parsed || parsed[3] <= 0) continue;
      const a = parsed[3] * suffix[i];
      if (a <= 0) continue;
      if (a >= 1) {
        bottom = [parsed[0], parsed[1], parsed[2], 1];
        assumedBase = false;
        break;
      }
      layers.push([parsed[0], parsed[1], parsed[2], a]);
    }
    let background = bottom;
    for (let i = layers.length - 1; i >= 0; i--) background = compositeOver(layers[i], background);

    const parsedFg = parse(styles[0].color) ?? ([0, 0, 0, 1] as const);
    const fg = compositeOver([parsedFg[0], parsedFg[1], parsedFg[2], parsedFg[3] * suffix[0]], background);
    return { color: [fg[0], fg[1], fg[2], 1] as Rgba, background, assumedBase };
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
  for (const el of scope.querySelectorAll('*')) {
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
    const { color, background, assumedBase } = effectiveColors(el);
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
  return { measured: samples.length, samples };
}
