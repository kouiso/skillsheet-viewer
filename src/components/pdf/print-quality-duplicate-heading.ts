/**
 * 案件タイトルが「続き」を伴わない素の見出しとして複数ページに出ていないかを検査する。
 *
 * 背景（レビュー指摘・実測 `.evidence/pdf-print-redesign/skillsheet-new-design.pdf`）:
 * 詳細版カードの「続き」判定は開始ページを記録して行う（project-card-detail.tsx の
 * markFirstContent）。この記録が壊れると、実際に本文が乗る 2 枚目のページにも
 * 「続き」を付けずに素のタイトルがもう一度描かれる。実測で 2 件確認した:
 *  - p8 下端に空のカード枠（タイトル・会社・期間のみ、本文 0）で新しい見出しが現れ、
 *    p9 上端に**同じ素のタイトル**がもう一度現れる（本来は「（続き）」のはず）。
 *  - p29→p30 でも同じ壊れ方（別の案件）。
 *
 * 既存の 7 項目はどちらもこれを検出できない: `headless-page` はページ先頭 34pt の帯
 * しか見ないため、p8 のように先頭が「別案件の続き見出し」で始まる普通のページは通る。
 * `sparse-page` はページ全体の文字数を見るため、p8 はカード枠 1 つぶんの空白があっても
 * 他の内容で文字数が閾値を超え、赤にならない。
 *
 * ここでは pdfjs のテキスト層だけを見る（print-quality.ts と同じ立ち位置）。案件タイトルは
 * `PRINT_TYPE.projectTitle.fontSize = 13` でしか描画されない（本文 11.5 / メタ 11 /
 * 会社見出し 15 で、いずれも 13 とは重ならない）。この字号のテキストだけをページ全体
 * （先頭帯に限らない）から拾えば、見出しがページのどこに出ても — 空カード枠がページ
 * 下端に来ても、続きが誤って先頭に再出現しても — 拾える。
 *
 * print-quality.ts は並行編集中のため import しない（このファイル自身がその置き換え候補の
 * 1 つになるが、統合は別作業とする）。
 */
import type { QualityPage } from './print-quality';

/**
 * 案件タイトルの字号。print-tokens.ts の PRINT_TYPE.projectTitle.fontSize と同じ値を
 * 手で書き写したもの（このファイルは並行編集中のため import しない。値が変わったら
 * ここも合わせる）。
 */
const PROJECT_TITLE_FONT_SIZE = 13;
/** pdfjs が返す transform[0] の丸め誤差を吸収する許容差（pt）。 */
const FONT_SIZE_TOLERANCE = 0.3;

export interface DuplicateHeadingFinding {
  check: 'duplicate-heading';
  /** 2 回目以降の重複が現れたページ番号（1 始まり）。 */
  page: number;
  detail: string;
}

// print-quality.ts の normalize と同じ考え方（pdfjs が 1 行を字種ごとの run に分けて
// 返すため空白を落とす。波ダッシュ類の揺れも吸収する）。箇条書き記号・強調記法は
// 案件タイトルに現れないため、そちらの正規化は持ち込まない。
const TILDE_VARIANTS = /[～〜⁓∼]/g;

function normalize(text: string): string {
  return text.replace(/\s+/g, '').replace(TILDE_VARIANTS, '~');
}

/** ページ全体から、案件タイトルの字号のテキストだけを読み順（上→下、同じ高さは左→右）に連結する。 */
function titleSizeText(page: QualityPage): string {
  return normalize(
    page
      .filter((item) => Math.abs(item.size - PROJECT_TITLE_FONT_SIZE) <= FONT_SIZE_TOLERANCE)
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map((item) => item.text)
      .join(''),
  );
}

/**
 * 案件タイトルごとに、「続き」を伴わない素の見出しが 2 ページ以上に出ていないかを見る。
 * 1 ページも見つからない（見出しが消えた、など）は別の壊れ方なので、ここでは指摘しない
 * — `missing-content` 等、既存の検査の役割。
 */
export function runDuplicateHeadingChecks(pages: QualityPage[], titles: string[]): DuplicateHeadingFinding[] {
  const findings: DuplicateHeadingFinding[] = [];
  const pageTexts = pages.map((page) => titleSizeText(page));

  for (const title of titles) {
    const key = normalize(title);
    // 短すぎるタイトルは他の文字列にたまたま埋没して誤検出しうる。案件タイトルが
    // 空・1 文字はデータ不備であって、この検査の役割ではない。
    if (key.length < 2) continue;
    const continuationKey = normalize(`${title}（続き）`);

    const plainPages: number[] = [];
    pageTexts.forEach((text, index) => {
      if (!text.includes(key)) return;
      // 「続き」表記が乗っているページは正常な継続ヘッダーなので数えない
      // （素のタイトルは「続き」表記の部分文字列として必ず含まれる）。
      if (text.includes(continuationKey)) return;
      plainPages.push(index + 1);
    });

    if (plainPages.length > 1) {
      findings.push({
        check: 'duplicate-heading',
        page: plainPages[1],
        detail: `「続き」を伴わない見出しが複数ページに出ている（p${plainPages.join(', p')}）: ${title}`,
      });
    }
  }
  return findings;
}
