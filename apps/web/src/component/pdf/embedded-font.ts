// 生成した PDF に埋め込まれた TrueType サブセット（/FontFile2）を取り出して健全性を見る。
//
// なぜテキスト抽出では足りないか（Issue #176）:
// PDF のテキスト層（content stream の TJ/Tj と ToUnicode）と、実際に字形を描く
// グリフ輪郭（glyf/loca）は独立している。フォント埋め込みが壊れても文字列は
// 問題なく抽出できてしまうため、pdfjs の getTextContent() をいくら通しても
// 「文字は入っているのに一文字も描画されない」状態を検知できない。
//
// 実際に vitest の jsdom 環境で renderToBuffer するとサブセットが丸ごと壊れる。
// 壊れ方は「バイナリを UTF-8 として往復させ、末尾に改行を足したもの」と byte-exact に
// 一致する（jsdom 側 === Buffer.concat([Buffer.from(node側.toString('utf8'), 'latin1'),
// Buffer.from('\n')])）。0x80 以上のバイトが置換文字へ潰れるうえ、多バイト列はデコードで
// 縮むので、テーブルディレクトリ以降が可変長でずれる。壊れた側で読める head / maxp /
// loca の数値は隣接フィールドの誤読でしかないので、個々の値ではなく辻褄で見ること。
// jsdom が別 realm の Uint8Array を持つため `chunk instanceof Uint8Array` の類の
// ガードが誤爆するのが筋だが、どのモジュールが実際にそうしているかは特定できていない。
// setupFiles を空にしても結果が 1 バイトも変わらないので、environment が唯一の変数
// であることだけは確かめてある。
//
// ここで分かるのは「字形が引ける形で埋め込まれているか」までで、描画の可視性
// （文字色・クリップ・text render mode・ページ外配置）は対象外。

import { inflateSync } from 'node:zlib';

/** TrueType のテーブルディレクトリ 1 件分。 */
interface TableRecord {
  offset: number;
  length: number;
}

export interface EmbeddedFontReport {
  /** サブセットのバイト数。 */
  byteLength: number;
  /** head.indexToLocFormat。0 なら 16bit loca、1 なら 32bit loca。 */
  indexToLocFormat: number;
  /** maxp.numGlyphs。 */
  numGlyphs: number;
  /** loca から読み出せたオフセットの件数。健全なら numGlyphs + 1 と一致する。 */
  locaEntryCount: number;
  /** loca のエントリ数が numGlyphs + 1 と一致するか。 */
  locaCountMatchesNumGlyphs: boolean;
  /** loca から復元した「グリフ 1 件あたりの輪郭バイト数」。 */
  outlineLengths: number[];
  /** 輪郭を持つ（＝空でない）グリフの数。 */
  nonEmptyGlyphCount: number;
  /** loca のオフセットが単調非減少か。壊れていると false。 */
  offsetsMonotonic: boolean;
  /** loca の最終オフセットが glyf のテーブル長に収まっているか。 */
  lastOffsetWithinGlyf: boolean;
}

const SFNT_HEADER_BYTES = 12;
const TABLE_RECORD_BYTES = 16;
const HEAD_INDEX_TO_LOC_FORMAT_OFFSET = 50;
const MAXP_NUM_GLYPHS_OFFSET = 4;

function readTableDirectory(font: Buffer): Map<string, TableRecord> {
  const tables = new Map<string, TableRecord>();
  if (font.length < SFNT_HEADER_BYTES) return tables;
  const numTables = font.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const record = SFNT_HEADER_BYTES + i * TABLE_RECORD_BYTES;
    // テーブル数が壊れている場合に範囲外を読まないよう、都度長さを確かめる。
    if (record + TABLE_RECORD_BYTES > font.length) break;
    const tag = font.toString('latin1', record, record + 4);
    tables.set(tag, { offset: font.readUInt32BE(record + 8), length: font.readUInt32BE(record + 12) });
  }
  return tables;
}

function readLocaOffsets(font: Buffer, loca: TableRecord, indexToLocFormat: number): number[] {
  const end = Math.min(loca.offset + loca.length, font.length);
  const offsets: number[] = [];
  if (indexToLocFormat === 0) {
    // 16bit 形式は「実オフセットの半分」を格納する仕様なので 2 倍して戻す。
    for (let at = loca.offset; at + 2 <= end; at += 2) offsets.push(font.readUInt16BE(at) * 2);
    return offsets;
  }
  for (let at = loca.offset; at + 4 <= end; at += 4) offsets.push(font.readUInt32BE(at));
  return offsets;
}

/** 間接オブジェクト 1 件。`bodyStart` は `N G obj` の直後のバイト位置。 */
interface IndirectObject {
  bodyStart: number;
  body: string;
}

/**
 * `N G obj … endobj` を 1 回の走査で索引化する。
 * 参照のたびに全文を検索し直すと参照数×PDF 長で効いてくるうえ、オブジェクト番号を
 * 埋め込んだ正規表現を都度組み立てることになるので、先に引ける形にしておく。
 */
function indexIndirectObjects(text: string): Map<string, IndirectObject> {
  const objects = new Map<string, IndirectObject>();
  for (const match of text.matchAll(/(?<![0-9])(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g)) {
    const key = `${Number(match[1])} ${Number(match[2])}`;
    // 同じ番号が複数回現れる（インクリメンタル更新）場合は後勝ちが最新。
    objects.set(key, {
      bodyStart: match.index + match[0].length - END_OBJECT_KEYWORD.length - match[3].length,
      body: match[3],
    });
  }
  return objects;
}

/**
 * PDF のオブジェクト辞書から、宣言された /Length を読む。間接参照は解決する。
 * `/Length1` 等の別キーは `\s` を要求することで拾わない。
 */
function readDeclaredLength(objects: Map<string, IndirectObject>, dictionary: string): number | null {
  // 間接参照を先に見る。直接値のパターンで否定先読みを使うと、`/Length 1234 0 R` の
  // ときに (\d+) が "123" までバックトラックして先読みが成立し、誤った長さを返す。
  const indirect = /\/Length\s+(\d+)\s+(\d+)\s+R/.exec(dictionary);
  if (indirect) {
    const target = objects.get(`${Number(indirect[1])} ${Number(indirect[2])}`);
    const value = target && /^\s*(\d+)/.exec(target.body);
    return value ? Number(value[1]) : null;
  }
  const direct = /\/Length\s+(\d+)/.exec(dictionary);
  return direct ? Number(direct[1]) : null;
}

// 正規表現に literal で書いている終端キーワード。捕捉範囲の開始位置を末尾から
// 逆算するのに使う。
const END_OBJECT_KEYWORD = 'endobj';

/** 埋め込みフォントプログラムの種別ごとの本数。 */
export interface EmbeddedFontFileKinds {
  /** /FontFile2 — TrueType（glyf/loca）。 */
  trueType: number;
  /** /FontFile3 — CFF / OpenType。 */
  cff: number;
  /** /FontFile — Type1。 */
  type1: number;
}

/** PDF に埋め込まれたフォントプログラムを種別ごとに数える。 */
export function countEmbeddedFontFiles(pdf: Buffer): EmbeddedFontFileKinds {
  const text = pdf.toString('latin1');
  return {
    trueType: [...text.matchAll(/\/FontFile2\s+\d+\s+\d+\s+R/g)].length,
    cff: [...text.matchAll(/\/FontFile3\s+\d+\s+\d+\s+R/g)].length,
    type1: [...text.matchAll(/\/FontFile\s+\d+\s+\d+\s+R/g)].length,
  };
}

/**
 * PDF バイト列から /FontFile2 で参照される TrueType サブセットを全て取り出す。
 * FlateDecode されている場合は展開する。
 */
export function extractEmbeddedTrueTypeFonts(pdf: Buffer): Buffer[] {
  const fonts: Buffer[] = [];
  // latin1 はバイト値と符号点が 1:1 に対応するため、文字列の index をそのまま
  // バイトオフセットとして使える。PDF 全体の変換は 1 回だけにする。
  const text = pdf.toString('latin1');
  const objects = indexIndirectObjects(text);

  for (const reference of text.matchAll(/\/FontFile2\s+(\d+)\s+(\d+)\s+R/g)) {
    // 世代番号を捨てて 0 決め打ちにすると、非ゼロ世代の PDF でフォントを取り出せない。
    const object = objects.get(`${Number(reference[1])} ${Number(reference[2])}`);
    if (!object) continue;

    const streamKeyword = /stream\r?\n/.exec(object.body);
    if (!streamKeyword) continue;
    const bodyStart = object.bodyStart + streamKeyword.index + streamKeyword[0].length;

    // 終端キーワードで切ると、圧縮データ末尾が 0x0D のときにその 1 バイトまで
    // 区切りとして食われて展開に失敗する。宣言された /Length で切る。
    // /Length が読めない場合に `\nendstream` を探して代用すると、ストリーム本体の
    // バイナリに偶然そのバイト列が含まれるだけで途中を本物の終端と誤認して切り詰める
    // （実測で再現済み）。安全に境界を決められないフォントは、壊れた中身を拾うより
    // 抽出しない方が安全なので諦める。
    const declared = readDeclaredLength(objects, object.body.slice(0, streamKeyword.index));
    if (declared === null) continue;
    const bodyEnd = Math.min(bodyStart + declared, pdf.length);
    if (bodyEnd <= bodyStart) continue;

    const raw = pdf.subarray(bodyStart, bodyEnd);
    // 展開できない＝FlateDecode 以外のフィルタか壊れている。無圧縮の sfnt なら
    // そのまま読めるので後段の検査へ回し、そうでなければ後段が必須テーブル欠落で落ちる。
    let inflated: Buffer | null = null;
    try {
      inflated = inflateSync(raw);
    } catch {
      inflated = null;
    }
    fonts.push(inflated ?? raw);
  }
  return fonts;
}

/**
 * 埋め込みサブセットの glyf/loca が読み出せる形になっているかを調べる。
 * 壊れている場合でも例外にせず、判定材料を返す（テスト側で何が壊れたか出せるように）。
 */
export function inspectEmbeddedFont(font: Buffer): EmbeddedFontReport {
  const tables = readTableDirectory(font);
  const head = tables.get('head');
  const maxp = tables.get('maxp');
  const loca = tables.get('loca');
  const glyf = tables.get('glyf');
  if (!head || !maxp || !loca || !glyf) {
    // 壊れたサブセットではタグ自体が非表示バイトになるため、そのまま出すと
    // CI ログにバイナリが流れる。読める文字だけ残す。
    const tags = [...tables.keys()].map((tag) => tag.replace(/[^\x20-\x7e]/g, '.')).join(',');
    throw new Error(`埋め込みフォントに必須テーブルがない: ${tags}`);
  }
  // ディレクトリごと壊れていると offset / length が範囲外を指す。RangeError という
  // 原因の分からない例外にせず、どこが壊れているか分かる形で落とす。
  for (const [name, table] of [
    ['head', head],
    ['maxp', maxp],
    ['loca', loca],
    ['glyf', glyf],
  ] as const) {
    if (table.offset > font.length || table.length > font.length - table.offset) {
      throw new Error(`埋め込みフォントの ${name} テーブルがサブセットの範囲外を指している`);
    }
  }
  if (head.length < HEAD_INDEX_TO_LOC_FORMAT_OFFSET + 2 || maxp.length < MAXP_NUM_GLYPHS_OFFSET + 2) {
    throw new Error('埋め込みフォントの head / maxp が必要な長さに足りない');
  }

  const indexToLocFormat = font.readInt16BE(head.offset + HEAD_INDEX_TO_LOC_FORMAT_OFFSET);
  // 仕様上 0（16bit）か 1（32bit）しかない。他の値だとエントリ幅が決まらず、
  // 黙って 32bit として読むと壊れたオフセットを健全に見せかねない。
  if (indexToLocFormat !== 0 && indexToLocFormat !== 1) {
    throw new Error(`埋め込みフォントの indexToLocFormat が不正: ${indexToLocFormat}`);
  }
  const locaEntryBytes = indexToLocFormat === 0 ? 2 : 4;
  // loca はエントリの並びそのものなので、テーブル長は必ずエントリ幅の倍数になる。
  if (loca.length % locaEntryBytes !== 0) {
    throw new Error(`埋め込みフォントの loca テーブル長がエントリ幅の倍数でない: ${loca.length} % ${locaEntryBytes}`);
  }

  const numGlyphs = font.readUInt16BE(maxp.offset + MAXP_NUM_GLYPHS_OFFSET);
  const offsets = readLocaOffsets(font, loca, indexToLocFormat);

  const outlineLengths: number[] = [];
  let offsetsMonotonic = true;
  for (let i = 0; i + 1 < offsets.length; i++) {
    const length = offsets[i + 1] - offsets[i];
    if (length < 0) offsetsMonotonic = false;
    outlineLengths.push(length);
  }

  return {
    byteLength: font.length,
    indexToLocFormat,
    numGlyphs,
    locaEntryCount: offsets.length,
    // loca は必ずグリフ数 + 1 個のオフセットを持つ。申告した形式と実体がずれると
    // ここが合わなくなるため、破損の一番はっきりした手掛かりになる。
    locaCountMatchesNumGlyphs: offsets.length === numGlyphs + 1,
    outlineLengths,
    nonEmptyGlyphCount: outlineLengths.filter((length) => length > 0).length,
    offsetsMonotonic,
    lastOffsetWithinGlyf: offsets.length > 0 && offsets[offsets.length - 1] <= glyf.length,
  };
}
