/**
 * 出来上がった PDF が「提出できる状態か」を機械で判定する検査。
 *
 * 現行 PDF で実際に起きていた壊れ方（文字の重なり、見出しの無いページ、6 行だけの空ページ、
 * 表からの溢れ、ページ番号が 1 ページも出ていない）は、どれもエラーを出さない。
 * 目で 36 ページを確認するのは現実的でないので、pdfjs が返す 1 文字単位の座標から判定する。
 *
 * ここは純関数だけを置く。PDF の描画も DB へのアクセスもしない（テストから素で呼べるように）。
 */

/** pdfjs の textContent item から取り出した、判定に必要な最小の情報。 */
export interface QualityItem {
  text: string;
  /** フォントサイズ（transform[0]）。 */
  size: number;
  /** 左端（transform[4]）。 */
  x: number;
  /** ベースライン（transform[5]）。 */
  y: number;
  /** 描画幅。 */
  width: number;
}

export type QualityPage = QualityItem[];

export interface OverlapPair {
  a: QualityItem;
  b: QualityItem;
  /** 重なっている幅（pt）。 */
  amount: number;
  /** 狭い方の幅に対する重なりの割合。 */
  ratio: number;
}

export interface QualityFinding {
  check: string;
  /** 1 始まりのページ番号。文書全体に対する指摘は 0。 */
  page: number;
  detail: string;
}

export interface QualityInput {
  pages: QualityPage[];
  /** 会社名・案件名など「ページの先頭に来ていいはずの見出し」。 */
  headings: string[];
  /** 全文に必ず含まれていなければならない文字列（案件の本文など）。 */
  requiredTexts: { label: string; text: string }[];
}

export interface QualityOptions {
  /** 本文の右端。A4 縦・左右余白 40pt なら 555。 */
  contentRight: number;
  /** 最小フォントサイズ。 */
  minFontSize: number;
  /** 空ページと判定する文字数の下限。 */
  minCharsPerPage: number;
  /** ページ先頭の帯とみなす高さ（この範囲の item を「先頭」として見る）。 */
  topBandHeight: number;
  /**
   * running footer を除外する高さ。ページ下端からこの範囲の item は「先頭の見出し」の
   * 判定に使わない。**上端は除外しない** — この設計にページ上部の running header は
   * 無く、上端を除外すると本物の見出しごと落として全ページが赤になる（実測で 35/35）。
   */
  footerBandHeight: number;
  /** 重なりと認める最小の幅（pt）。隣接 run の接触（0pt）を除くために使う。 */
  minOverlapPt: number;
  /** 重なりと認める最小の割合（狭い方の幅に対して）。 */
  minOverlapRatio: number;
}

export const DEFAULT_QUALITY_OPTIONS: QualityOptions = {
  contentRight: 555,
  minFontSize: 11,
  minCharsPerPage: 200,
  topBandHeight: 34,
  footerBandHeight: 40,
  minOverlapPt: 0.5,
  minOverlapRatio: 0.2,
};

/**
 * 突合用の正規化。
 *
 * 空白を落とすのは、pdfjs が 1 行を字種ごとの run に分けて返すため。加えて 2 つ、
 * 実測で誤検出の原因になったものを吸収する:
 *
 * - **波ダッシュ類の揺れ**: DB は全角チルダ U+FF5E（`～`）だが、PDF から抽出すると
 *   波ダッシュ U+301C（`〜`）で返る。案件名 6 件が「PDF に無い」と誤検出された。
 * - **箇条書きの記号**: 描画側は list item の先頭に `—` を挿す。生の本文には無いので、
 *   項目をまたぐ文字列が一致しなくなる。突合の両側から落として揃える。
 * - **強調記法の残骸**: 実データに `\*\*.htaccess\*\*` のようにエスケープされた強調があり、
 *   remark はこれをリテラルのアスタリスクとして描画する。突合の両側から落として揃える。
 */
const TILDE_VARIANTS = /[\uFF5E\u301C\u2053\u223C]/g;
const BULLET_GLYPHS = /[\u2014\u2022]/g;
const EMPHASIS_MARKS = /[*_`]/g;

function normalize(text: string): string {
  return text.replace(/\s+/g, '').replace(TILDE_VARIANTS, '~').replace(BULLET_GLYPHS, '').replace(EMPHASIS_MARKS, '');
}

/**
 * 「PDF に載っているはずの文字列」を突合キーに変える。
 *
 * duties / acquired / comment は markdown の自由記述。描画側は箇条書きを記号に、強調を
 * 太字に変換するので、生の markdown をそのまま探すと必ず「見つからない」になる
 * （実測で 21 件の誤検出が出た）。記法を落とし、行をまたがない範囲で切り出す。
 */
export function toSearchKey(text: string, length = 16): string {
  const lines = text
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/`([^`]*)`/g, '$1')
        // markdown のエスケープを外す。実データに `\*\*.htaccess\*\*` があり、描画側は
        // これを `**.htaccess**`（リテラルのアスタリスク）として出すため、生のまま探すと外れる。
        .replace(/\\([*_~`[\]\\])/g, '$1')
        .replace(/\*\*|__|~~/g, '')
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
        .replace(/^\s*#+\s*/, '')
        .replace(/^\s*>\s?/, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'),
    )
    .map(normalize)
    .filter((line) => line.length > 0);
  if (lines.length === 0) return '';
  // **最も長い 1 行**から切り出す。行をまたぐキーを作ると、行の境界で描画側が挿す
  // 箇条書き記号や段落の区切りが入って必ず外れる（実測で誤検出が出た）。
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a));
  if (longest.length <= length) return longest;
  const start = Math.floor((longest.length - length) / 2);
  return longest.slice(start, start + length);
}

function pageText(page: QualityPage): string {
  return page.map((item) => item.text).join('');
}

/**
 * 文字の重なり。
 *
 * 現行 p13 の症状は `lineHeight ÷ fontSize = 0.03` で、ほぼ同一の y に 2 行が二重書きされて
 * いた。だから「y の差が 1pt 未満」かつ「x の範囲が重なる」で判定する。
 * `fontSize × 0.5` のような緩い閾値は、日本語と英数字が混ざる行の縦位置差で誤検出する。
 */
export function findOverlaps(page: QualityPage, options: QualityOptions = DEFAULT_QUALITY_OPTIONS): OverlapPair[] {
  const found: OverlapPair[] = [];
  const sorted = [...page].sort((p, q) => p.y - q.y || p.x - q.x);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (Math.abs(a.y - b.y) >= 1) break;
      const amount = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      if (amount <= options.minOverlapPt) continue;
      // 隣り合う run は境界がちょうど接する（実測で amount = 0.00pt）。接触を重なりと
      // 数えると 1 ページに数十件の誤検出が出て検査が意味を失うため、幅に対する割合でも
      // 足切りする。本物の二重書き（行がまるごと同じ座標に来る）は割合がほぼ 1 になる。
      const ratio = amount / Math.max(Math.min(a.width, b.width), 0.01);
      if (ratio < options.minOverlapRatio) continue;
      found.push({ a, b, amount, ratio });
    }
  }
  return found;
}

/**
 * ページ先頭の帯（見出しが載るべき範囲）のテキストを返す。
 *
 * running footer は全ページに出るので、これを「見出し」と数えると検査が常に緑になって
 * 意味を失う。下端の footer 帯だけを除外する（上端に running header は無い）。
 */
export function headingBand(page: QualityPage, options: QualityOptions): string {
  if (page.length === 0) return '';
  const ys = page.map((item) => item.y);
  const bottom = Math.min(...ys);
  const withoutFooter = page.filter((item) => item.y > bottom + options.footerBandHeight);
  const target = withoutFooter.length > 0 ? withoutFooter : page;
  const targetTop = Math.max(...target.map((item) => item.y));
  return normalize(
    target
      .filter((item) => item.y >= targetTop - options.topBandHeight)
      .sort((p, q) => q.y - p.y || p.x - q.x)
      .map((item) => item.text)
      .join(''),
  );
}

function startsWithHeading(page: QualityPage, headings: string[], options: QualityOptions): boolean {
  if (headings.length === 0) return false;
  const bandText = headingBand(page, options);
  if (!bandText) return false;
  // 帯の「先頭」ではなく「帯の中に含まれるか」で見る。カードのヘッダーは横並びで、
  // 期間バッジが案件名よりわずかに上に来るため（実測）、y で並べると帯は期間から始まる。
  // 読み手にとっては期間と案件名が同じ帯に並んでいれば「何を読んでいるか」は分かる。
  // 帯は 34pt（約 2 行）しかないので、本文が偶然会社名に触れて通ることは起きない。
  return headings.some((heading) => {
    const key = normalize(heading);
    // 会社名は「受託」のように 2 文字のことがある（実データ）。短くても落とさない。
    if (key.length < 2) return false;
    return bandText.includes(key.slice(0, Math.min(10, key.length)));
  });
}

/** 7 項目の検査を回して、指摘の一覧を返す。空配列なら提出できる。 */
export function runQualityChecks(
  input: QualityInput,
  options: QualityOptions = DEFAULT_QUALITY_OPTIONS,
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const { pages } = input;

  pages.forEach((page, index) => {
    const pageNumber = index + 1;

    // 1. 文字の重なり
    for (const { a, b, amount, ratio } of findOverlaps(page, options).slice(0, 3)) {
      findings.push({
        check: 'overlap',
        page: pageNumber,
        detail: `y=${a.y.toFixed(1)} で「${a.text}」と「${b.text}」が ${amount.toFixed(2)}pt（幅比 ${ratio.toFixed(2)}）重なっている`,
      });
    }

    // 2. 見出しの無いページ
    if (!startsWithHeading(page, input.headings, options)) {
      findings.push({
        check: 'headless-page',
        page: pageNumber,
        detail: `先頭が見出しでない: ${headingBand(page, options).slice(0, 50)}`,
      });
    }

    // 3. 空ページ（最終ページは本文が尽きて短くなるので除外）
    //
    // 例外がもう 1 つある。「1 案件がページを跨いで途中で切れるくらいなら、丸ごと
    // 次ページへ送って現在のページを空白のまま残す」（オーナーの指示、company-grouping
    // 作業）を実装すると、会社見出しの直後でカードが丸ごと次ページへ送られ、見出しだけの
    // 薄いページが正規に生まれる（実測: p30、見出し + 概要のみで 81 文字）。
    // 「このページ自身」と「次のページ」の両方が見出しから始まっているときだけ、これを
    // 意図した空白として除外する。両方を要求するのは、本文が途中で千切れて消えた本物の
    // 欠落（次ページが見出しでなく、途切れた本文の続きから始まる）を従来どおり検出する
    // ため——閾値（200 文字）自体は変えない。
    const chars = normalize(pageText(page)).length;
    if (pageNumber < pages.length && chars < options.minCharsPerPage) {
      const next = pages[index + 1];
      const isDeliberateWhitespace =
        startsWithHeading(page, input.headings, options) &&
        next !== undefined &&
        startsWithHeading(next, input.headings, options);
      if (!isDeliberateWhitespace) {
        findings.push({ check: 'sparse-page', page: pageNumber, detail: `本文が ${chars} 文字しかない` });
      }
    }

    // 6. 本文幅からの溢れ
    for (const item of page) {
      const right = item.x + item.width;
      if (right > options.contentRight + 0.5) {
        findings.push({
          check: 'overflow',
          page: pageNumber,
          detail: `右端 ${right.toFixed(1)}pt が本文幅 ${options.contentRight}pt を超えている: 「${item.text}」`,
        });
        break;
      }
    }

    // 7. 最小フォントサイズ
    const tooSmall = page.filter((item) => item.size < options.minFontSize - 0.01);
    if (tooSmall.length > 0) {
      findings.push({
        check: 'font-too-small',
        page: pageNumber,
        detail: `${tooSmall.length} 箇所が ${options.minFontSize}pt 未満（最小 ${Math.min(...tooSmall.map((i) => i.size)).toFixed(2)}pt）`,
      });
    }
  });

  // 4. 内容消失（全件全文の要件をここで機械検証する）
  const fullText = normalize(pages.map(pageText).join(''));
  for (const required of input.requiredTexts) {
    const key = normalize(required.text);
    if (!key) continue;
    if (!fullText.includes(key)) {
      findings.push({
        check: 'missing-content',
        page: 0,
        detail: `${required.label} が PDF に見つからない: ${key.slice(0, 30)}…`,
      });
    }
  }

  return findings;
}

/** 指摘を検査ごとに数えた要約。反復中の進捗を 1 行で見るために使う。 */
export function summarize(findings: QualityFinding[]): string {
  if (findings.length === 0) return 'すべて緑';
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.check, (counts.get(f.check) ?? 0) + 1);
  return [...counts.entries()].map(([check, n]) => `${check}=${n}`).join(' ');
}
