/**
 * pdfjs のテキスト層には現れない「文字を伴わない図形」の壊れを、ラスタライズして検出する。
 *
 * `print-quality.ts` は pdfjs が返す 1 文字単位の座標だけを見る。実測（p11、
 * `.evidence/pdf-print-redesign/skillsheet-new-design.pdf`）では、技術チップの表が
 * ページ下端でちぎれ、塗りチップ 1 個・枠線チップ 2 個の断片が本文の最後の行より下、
 * 版面の下端ぎりぎりに残っていた。断片には文字が 1 文字も乗っていない
 * （実測で色だけ確認: 塗り側 rgb(31,58,95) = PRINT_COLOR.accent、枠線側
 * rgb(138,144,153) = PRINT_COLOR.rule）ため、テキスト層は空で、既存の検査は素通りする。
 *
 * ここでは Ghostscript でページをビットマップへ変換し、2 種類の指摘を出す。
 *  1. margin-ink: 左右の真の余白（ページのどんな要素も絶対に描かれないはずの帯）に
 *     インクがあれば、それだけで壊れている。テキストとの突き合わせをしない単純な判定で
 *     十分（実測で 36 ページとも誤検出ゼロ）。**上下の余白はここに含めない** —
 *     ページ跨ぎの継続ヘッダー（`print-document.tsx` の `continuationHeader`）は
 *     padTop の帯（headerTop=16pt）に正当に文字を描くため、単純なブランケット判定だと
 *     ほぼ全ページで誤検出する（合成フィクスチャで実測）。
 *  2. edge-orphan-shape: 版面上端・下端に近い帯の中で、pdfjs のテキスト項目のどれとも
 *     重ならない「文字を伴わないインクの塊」（罫線 1 本ぶんは除く）。p11 の壊れ方そのもの。
 *     テキストと突き合わせるのは、正当な要素（継続ヘッダー、簡約表の列見出し）が
 *     版面の縁ぎりぎりに来ることがあり、単純なブランケット判定だと正当な文字を
 *     誤検出するため（p30 の簡約表ヘッダーで実測）。
 *
 *     もう 1 つ正当な要素として、**閉じ切ったカードの外枠（`project-card-detail.tsx` の
 *     `styles.card`）自身の下端** がある。カード最後のブロックは本文の下に
 *     `cardPadVertical`（9pt）ぶんの余白を挟んでから外枠の下辺・角丸に入るため、
 *     カードがたまたま版面の縁ぎりぎりで閉じ切ると、本文の最終行から見て
 *     `textPadding.bottom` が浅いと「文字を伴わない図形」に見えてしまう
 *     （実測: committed synthetic fixture p20、案件「中小企業向け会計SaaSの機能追加」。
 *     角丸左右の外枠が版面の縁の走査帯とぶつかって連結成分の外接矩形が膨らむ ── 実際に
 *     文字を伴わない図形なのは高さ 18px のうち末尾 6〜7px の角丸部分だけで、外接矩形が
 *     走査帯の上端まで伸びるのはこの膨らみのせい）。本文・カード全体は完全に描画されており
 *     壊れていない（gs でラスタライズし目視・pdfjs テキスト抽出の両方で確認済み）。
 *     `textPadding.bottom` を `cardPadVertical` を覆う値まで広げてこの正当な閉じ方を通す。
 *     一方、真の壊れ方（本文が別ページへ丸ごと逃げ、断片だけが独立して残る）は本文から
 *     数十 pt 以上離れているため、この程度の拡張では拾えなくならない
 *     （`print-quality-raster.node.test.tsx` で回帰なしを確認済み）。
 *
 * pdfjs は PDF 標準の左下原点・y 上向き、ラスタ画像は左上原点・y 下向きなので、
 * 変換はこのファイルの中で閉じる（呼び出し側は QualityPage をそのまま渡せばよい）。
 *
 * 座標の既定値は print-tokens.ts の PRINT_SIZE を手で書き写したもの
 * （このファイルは並行編集中のため import しない。値が変わったらここも合わせる）。
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { QualityPage } from './print-quality';

export interface RasterQualityOptions {
  /** ラスタライズの解像度。 */
  dpi: number;
  /** A4 縦の寸法（pt）。print-tokens.ts の PRINT_SIZE.pageWidth / pageHeight と同じ。 */
  pageWidthPt: number;
  pageHeightPt: number;
  /** ページ内マージン（pt）。print-tokens.ts の PRINT_SIZE.padTop / padHorizontal と同じ。 */
  marginTopPt: number;
  marginSidePt: number;
  /**
   * 版面（本文が描画されうる領域）の下端。ページ上端からの距離（pt）。
   * print-primitives.tsx の `page` スタイル `paddingBottom: PRINT_SIZE.padBottom + 14` と
   * 同じ実効値（842 − (32 + 14) = 796）。
   */
  contentBottomPt: number;
  /**
   * ページ下端からこの高さ（pt）はフッターの描画領域として除外する。
   * 実測でフッターの罫線は版面下端の 7pt 下から始まる（版面下端と重ならない）ため、
   * 40pt という余裕を持たせても本文側を巻き込まない。
   */
  footerZonePt: number;
  /** 版面下端からさかのぼってスキャンする帯の高さ（pt）。ここに文字を伴わない図形が無いか見る。 */
  edgeBandPt: number;
  /** ページ上端からの帯の高さ（pt）。継続ヘッダーが乗る padTop の帯をテキスト突き合わせで見る。 */
  topBandPt: number;
  /**
   * この高さ・幅（px）未満のインクの塊は罫線とみなして無視する。0.75pt の罫線は水平なら
   * 高さが、垂直なら幅が細いので、両方をこの値で足切りしないとカードの縦罫線
   * （高さは版面いっぱいだが幅は 2〜3px）を「図形」と誤検出する（実測で確認）。
   */
  minBlobHeightPx: number;
  minBlobWidthPx: number;
  /**
   * 外接矩形の面積に対するインク画素の割合の下限。カードの罫線 3 辺（縦 2 本 + 上端の
   * 横 1 本）はつながって 1 つの連結成分になり、外接矩形はカード幅いっぱいに広がるが
   * 中身は空白（実測密度 0.02 程度）。チップの断片（塗り・枠線とも）は密度 0.4〜1.0 なので、
   * 幅・高さの足切りをすり抜ける中空の枠をここで弾く。
   */
  minInkDensity: number;
  /** 0-255。この値未満のグレースケール値を「インクがある」とみなす。 */
  grayInkThreshold: number;
  /**
   * テキスト項目の当たり判定を広げる余白（pt）。文字の実際のグリフ高さは size と一致しないため。
   * `bottom` はカード最後のブロックの下端が外枠の角丸に入るまでの `cardPadVertical`
   * （print-tokens.ts、9pt）も覆える値にする。狭いと、カードがたまたま版面の縁で
   * 閉じ切ったときに外枠の角丸を「文字を伴わない図形」と誤検出する（ファイル冒頭コメント参照）。
   */
  textPadding: { top: number; bottom: number; side: number };
}

/**
 * 595 × 842pt（A4）・padTop 42 / padHorizontal 40 / 版面下端 796pt を前提にした既定値。
 * 実測（page11.png, 150dpi）: 最後の本文テキストの上端 ≈ px1608、版面下端 ≈ px1658、
 * 検出したい図形断片は px1626-1658 に居る。edgeBandPt=50 はこれを余裕を持って覆う。
 */
export const DEFAULT_RASTER_OPTIONS: RasterQualityOptions = {
  dpi: 150,
  pageWidthPt: 595,
  pageHeightPt: 842,
  marginTopPt: 42,
  marginSidePt: 40,
  contentBottomPt: 796,
  footerZonePt: 40,
  edgeBandPt: 50,
  topBandPt: 42,
  minBlobHeightPx: 6,
  minBlobWidthPx: 6,
  minInkDensity: 0.15,
  grayInkThreshold: 230,
  // bottom=10: cardPadVertical（print-tokens.ts、9pt）+ 角丸ぶんの余裕 1pt。
  textPadding: { top: 9, bottom: 10, side: 1.5 },
};

export interface RasterFinding {
  check: 'margin-ink' | 'edge-orphan-shape';
  page: number;
  detail: string;
}

interface PixelRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface InkBlob extends PixelRect {
  /** 塊に含まれる実際のインク画素数（外接矩形の面積とは別。中空の枠を篩い落とすのに使う）。 */
  inkPixels: number;
}

/** gs で 1 ページ 1 PNG に展開する。一時ディレクトリごと呼び出し側が削除すること。 */
function rasterizePdfPages(pdfBuffer: Buffer, dpi: number): { dir: string; pngPaths: string[] } {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdf-raster-'));
  const pdfPath = path.join(dir, 'input.pdf');
  writeFileSync(pdfPath, pdfBuffer);
  const outPattern = path.join(dir, 'page-%04d.png');
  try {
    execFileSync(
      'gs',
      ['-q', '-dNOPAUSE', '-dBATCH', '-dSAFER', '-sDEVICE=png16m', `-r${dpi}`, `-sOutputFile=${outPattern}`, pdfPath],
      { stdio: 'pipe' },
    );
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`Ghostscript (gs) でのラスタライズに失敗した。gs がインストールされているか確認すること: ${error}`);
  }
  const pngPaths = readdirSync(dir)
    .filter((f) => f.startsWith('page-') && f.endsWith('.png'))
    .sort()
    .map((f) => path.join(dir, f));
  return { dir, pngPaths };
}

/** PNG 1 枚をグレースケールの生バイト列（1px = 1byte、行優先）へ変換する。 */
function readPageGray(pngPath: string): { width: number; height: number; data: Buffer } {
  const dims = execFileSync('identify', ['-format', '%w %h', pngPath]).toString().trim().split(/\s+/).map(Number);
  const [width, height] = dims;
  const data = execFileSync('convert', [pngPath, '-colorspace', 'Gray', '-depth', '8', 'gray:-'], {
    maxBuffer: 1024 * 1024 * 64,
  });
  return { width, height, data };
}

function firstInkPixel(
  gray: Buffer,
  width: number,
  rect: PixelRect,
  threshold: number,
): { x: number; y: number } | null {
  for (let y = rect.y0; y < rect.y1; y++) {
    const rowOffset = y * width;
    for (let x = rect.x0; x < rect.x1; x++) {
      if (gray[rowOffset + x] < threshold) return { x, y };
    }
  }
  return null;
}

/** 4 近傍のフラッドフィルで、矩形内のインクの塊（連結成分）を列挙する。 */
function findInkBlobs(gray: Buffer, width: number, rect: PixelRect, threshold: number): InkBlob[] {
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  if (w <= 0 || h <= 0) return [];
  const visited = new Uint8Array(w * h);
  const blobs: InkBlob[] = [];
  const stack: number[] = [];

  const isInk = (gx: number, gy: number) => gray[gy * width + gx] < threshold;

  for (let ly = 0; ly < h; ly++) {
    for (let lx = 0; lx < w; lx++) {
      const startIdx = ly * w + lx;
      if (visited[startIdx]) continue;
      visited[startIdx] = 1;
      if (!isInk(rect.x0 + lx, rect.y0 + ly)) continue;

      let minX = lx;
      let maxX = lx;
      let minY = ly;
      let maxY = ly;
      let inkPixels = 1;
      stack.push(startIdx);
      while (stack.length > 0) {
        // biome-ignore lint/style/noNonNullAssertion: 直前に length>0 を確認済み
        const cur = stack.pop()!;
        const cx = cur % w;
        const cy = (cur - cx) / w;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        const neighbors: [number, number][] = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const ni = ny * w + nx;
          if (visited[ni]) continue;
          visited[ni] = 1;
          if (isInk(rect.x0 + nx, rect.y0 + ny)) {
            inkPixels++;
            stack.push(ni);
          }
        }
      }
      blobs.push({ x0: rect.x0 + minX, y0: rect.y0 + minY, x1: rect.x0 + maxX + 1, y1: rect.y0 + maxY + 1, inkPixels });
    }
  }
  return blobs;
}

/**
 * ラスタ上の塊（pt 座標、ページ上端原点）が、そのページの pdfjs テキスト項目のどれかと
 * 重なるか。重なれば「文字を伴う」ので正常な描画とみなす。
 *
 * pdfjs の y は PDF 標準（左下原点・上向き）なので、ページ上端原点へ変換する。
 * グリフの実際の高さは size と一致しないため、上へ size×0.85・下へ size×0.25 広げた上で
 * さらに textPadding ぶん余裕を持たせる（実測ベースの概算で十分 — ここは「文字が近くに
 * あるか」の当たり判定であって、字形そのものの厳密な外接矩形を求める場面ではない）。
 */
function overlapsAnyText(
  blob: { leftPt: number; rightPt: number; topPt: number; bottomPt: number },
  items: QualityPage,
  pageHeightPt: number,
  padding: RasterQualityOptions['textPadding'],
): boolean {
  return items.some((item) => {
    const glyphTopPt = pageHeightPt - (item.y + item.size * 0.85) - padding.top;
    const glyphBottomPt = pageHeightPt - (item.y - item.size * 0.25) + padding.bottom;
    const glyphLeftPt = item.x - padding.side;
    const glyphRightPt = item.x + item.width + padding.side;
    const overlapsX = blob.leftPt < glyphRightPt && blob.rightPt > glyphLeftPt;
    const overlapsY = blob.topPt < glyphBottomPt && blob.bottomPt > glyphTopPt;
    return overlapsX && overlapsY;
  });
}

/** 指定した帯の中から、テキストの裏付けが無いインクの塊を探す（罫線 1 本ぶんは除く）。 */
function scanBandForOrphanShapes(
  gray: Buffer,
  width: number,
  band: PixelRect,
  pageItems: QualityPage,
  pxPerPtX: number,
  pxPerPtY: number,
  options: RasterQualityOptions,
): PixelRect[] {
  const blobs = findInkBlobs(gray, width, band, options.grayInkThreshold);
  return blobs.filter((blob) => {
    const blobHeightPx = blob.y1 - blob.y0;
    const blobWidthPx = blob.x1 - blob.x0;
    // 罫線 1 本ぶんは無視する。水平の罫線は高さが、カードの縦罫線は幅が細いので、
    // どちらか一方だけを見ると他方を見逃す（実測: 縦罫線は高さ 100px 超・幅 2〜3px）。
    if (blobHeightPx < options.minBlobHeightPx || blobWidthPx < options.minBlobWidthPx) return false;
    // カードの罫線 3 辺が繋がって 1 つの連結成分になったものを弾く（実測密度 0.02、
    // チップ断片は 0.4 以上）。
    const density = blob.inkPixels / (blobWidthPx * blobHeightPx);
    if (density < options.minInkDensity) return false;
    const blobPt = {
      leftPt: blob.x0 / pxPerPtX,
      rightPt: blob.x1 / pxPerPtX,
      topPt: blob.y0 / pxPerPtY,
      bottomPt: blob.y1 / pxPerPtY,
    };
    return !overlapsAnyText(blobPt, pageItems, options.pageHeightPt, options.textPadding);
  });
}

/**
 * PDF バイト列をラスタライズし、margin-ink / edge-orphan-shape の 2 種を検査する。
 * `pages` は同じ PDF から `extractQualityPages` で取り出したテキスト層（ページ数が一致すること）。
 */
export async function runRasterQualityChecks(
  pdfBuffer: Buffer,
  pages: QualityPage[],
  options: RasterQualityOptions = DEFAULT_RASTER_OPTIONS,
): Promise<RasterFinding[]> {
  const { dir, pngPaths } = rasterizePdfPages(pdfBuffer, options.dpi);
  try {
    if (pngPaths.length !== pages.length) {
      throw new Error(
        `ラスタライズしたページ数（${pngPaths.length}）とテキスト抽出のページ数（${pages.length}）が一致しない`,
      );
    }

    const findings: RasterFinding[] = [];

    pngPaths.forEach((pngPath, index) => {
      const pageNumber = index + 1;
      const { width, height, data } = readPageGray(pngPath);
      const pxPerPtX = width / options.pageWidthPt;
      const pxPerPtY = height / options.pageHeightPt;

      const marginSidePx = Math.round(options.marginSidePt * pxPerPtX);
      const contentBottomPx = Math.round(options.contentBottomPt * pxPerPtY);
      const footerZoneTopPx = Math.round((options.pageHeightPt - options.footerZonePt) * pxPerPtY);
      const topBandBottomPx = Math.round(options.topBandPt * pxPerPtY);

      // 左右の真の余白だけはテキストとの突き合わせをしないブランケット判定。
      // 何が正しく描画されていても、ここには絶対にインクが乗らない
      // （継続ヘッダーは left/right が padHorizontal ちょうどで、ここへは intrude しない）。
      const marginRegions: { label: string; rect: PixelRect }[] = [
        { label: '左余白', rect: { x0: 0, y0: 0, x1: marginSidePx, y1: height } },
        { label: '右余白', rect: { x0: width - marginSidePx, y0: 0, x1: width, y1: height } },
      ];
      for (const { label, rect } of marginRegions) {
        const hit = firstInkPixel(data, width, rect, options.grayInkThreshold);
        if (hit) {
          findings.push({
            check: 'margin-ink',
            page: pageNumber,
            detail: `${label}にインクがある（px x=${hit.x}, y=${hit.y}）`,
          });
        }
      }

      // 版面の上端・下端に近い帯は、継続ヘッダーや簡約表の列見出しが正当に縁ぎりぎりへ
      // 来ることがあるため、テキストとの突き合わせで「文字を伴わない図形」だけを拾う。
      const topBand: PixelRect = { x0: 0, y0: 0, x1: width, y1: topBandBottomPx };
      const edgeBandTopPx = Math.max(topBandBottomPx, contentBottomPx - Math.round(options.edgeBandPt * pxPerPtY));
      const bottomBand: PixelRect = {
        x0: marginSidePx,
        y0: edgeBandTopPx,
        x1: width - marginSidePx,
        y1: Math.max(contentBottomPx, footerZoneTopPx),
      };

      for (const band of [topBand, bottomBand]) {
        const orphanBlobs = scanBandForOrphanShapes(data, width, band, pages[index], pxPerPtX, pxPerPtY, options);
        for (const blob of orphanBlobs) {
          findings.push({
            check: 'edge-orphan-shape',
            page: pageNumber,
            detail: `版面の縁付近に文字を伴わない図形がある（px x=${blob.x0}-${blob.x1}, y=${blob.y0}-${blob.y1}, 高さ${blob.y1 - blob.y0}px）`,
          });
        }
      }
    });

    return findings;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** 指摘を検査ごとに数えた要約。print-quality.ts の summarize と同じ形。 */
export function summarizeRaster(findings: RasterFinding[]): string {
  if (findings.length === 0) return 'すべて緑';
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.check, (counts.get(f.check) ?? 0) + 1);
  return [...counts.entries()].map(([check, n]) => `${check}=${n}`).join(' ');
}
