import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { type EmbeddedFontReport, extractEmbeddedTrueTypeFonts, inspectEmbeddedFont } from './embedded-font';

// 検知できることを実際の壊し方で示すためのテスト。
// 「壊れた入力を入れても通る検証」は検証ではないので、Issue #176 で観測した
// 破損パターンを合成して、判定が落ちることを固定する。

const SFNT_HEADER_BYTES = 12;
const TABLE_RECORD_BYTES = 16;

interface TableInput {
  tag: string;
  data: Buffer;
}

/** 最小の sfnt（TrueType）を組み立てる。テーブルは 4 バイト境界に揃える。 */
function buildFont(tables: TableInput[]): Buffer {
  const directoryBytes = SFNT_HEADER_BYTES + tables.length * TABLE_RECORD_BYTES;
  const header = Buffer.alloc(directoryBytes);
  header.writeUInt32BE(0x00010000, 0);
  header.writeUInt16BE(tables.length, 4);

  const bodies: Buffer[] = [];
  let cursor = directoryBytes;
  tables.forEach((table, index) => {
    const record = SFNT_HEADER_BYTES + index * TABLE_RECORD_BYTES;
    header.write(table.tag, record, 4, 'latin1');
    header.writeUInt32BE(cursor, record + 8);
    header.writeUInt32BE(table.data.length, record + 12);
    const padding = (4 - (table.data.length % 4)) % 4;
    bodies.push(table.data, Buffer.alloc(padding));
    cursor += table.data.length + padding;
  });

  return Buffer.concat([header, ...bodies]);
}

function head(indexToLocFormat: number): Buffer {
  const data = Buffer.alloc(54);
  data.writeInt16BE(indexToLocFormat, 50);
  return data;
}

function maxp(numGlyphs: number): Buffer {
  const data = Buffer.alloc(32);
  data.writeUInt32BE(0x00010000, 0);
  data.writeUInt16BE(numGlyphs, 4);
  return data;
}

/** 健全な 32bit loca と、そのオフセットに見合う長さの glyf。 */
function healthyTables(outlineLengths: number[]): TableInput[] {
  const loca = Buffer.alloc((outlineLengths.length + 1) * 4);
  let offset = 0;
  outlineLengths.forEach((length, index) => {
    loca.writeUInt32BE(offset, index * 4);
    offset += length;
  });
  loca.writeUInt32BE(offset, outlineLengths.length * 4);
  return [
    { tag: 'head', data: head(1) },
    { tag: 'maxp', data: maxp(outlineLengths.length) },
    { tag: 'loca', data: loca },
    { tag: 'glyf', data: Buffer.alloc(offset, 1) },
  ];
}

/** 指定タグのテーブルレコードの先頭位置を返す。破損させる試験で使う。 */
function findTableRecord(font: Buffer, tag: string): number {
  const numTables = font.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const record = SFNT_HEADER_BYTES + i * TABLE_RECORD_BYTES;
    if (font.toString('latin1', record, record + 4) === tag) return record;
  }
  throw new Error(`テーブルが見つからない: ${tag}`);
}

/** glyph-verify.node.test.tsx が課しているのと同じ整合条件。 */
function isHealthy(report: EmbeddedFontReport): boolean {
  return (
    report.numGlyphs > 0 &&
    report.locaCountMatchesNumGlyphs &&
    report.offsetsMonotonic &&
    report.lastOffsetWithinGlyf &&
    report.nonEmptyGlyphCount >= report.numGlyphs - 2
  );
}

describe('inspectEmbeddedFont', () => {
  it('健全なサブセットは単調増加・glyf 内・非空グリフありと判定する', () => {
    const report = inspectEmbeddedFont(buildFont(healthyTables([80, 120, 160, 100])));

    expect(report.indexToLocFormat).toBe(1);
    expect(report.numGlyphs).toBe(4);
    expect(report.offsetsMonotonic).toBe(true);
    expect(report.lastOffsetWithinGlyf).toBe(true);
    expect(report.nonEmptyGlyphCount).toBe(4);
    expect(report.outlineLengths).toEqual([80, 120, 160, 100]);
  });

  it('Issue #176 の破損（jsdom 実行時の UTF-8 往復）を検知する', () => {
    // jsdom は別 realm の Uint8Array を持つため pdfkit の `chunk instanceof Uint8Array`
    // ガードが誤爆し、フォントのバイナリが UTF-8 として往復してしまう。0x80 以上の
    // バイトは置換文字 0xFD へ潰れ、テーブルディレクトリの offset / length ごと壊れる。
    const healthy = buildFont(healthyTables([80, 120, 160, 100]));
    const corrupted = Buffer.concat([Buffer.from(healthy.toString('utf8'), 'latin1'), Buffer.from('\n', 'latin1')]);

    expect(corrupted.includes(0xfd)).toBe(true);
    // 対照: 壊す前は全ての整合チェックを通る。
    expect(isHealthy(inspectEmbeddedFont(healthy))).toBe(true);

    // 壊れた側は「必須テーブルが引けない／ディレクトリが範囲外」で原因の分かる
    // 例外になるか、レポートが取れても整合チェックのどれかが落ちる。
    // どちらに転んでも素通りはしない、というのがここで固定したいこと。
    let corruptedIsHealthy: boolean;
    try {
      corruptedIsHealthy = isHealthy(inspectEmbeddedFont(corrupted));
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toMatch(/埋め込みフォント/);
      corruptedIsHealthy = false;
    }
    expect(corruptedIsHealthy).toBe(false);
  });

  it('loca だけが局所的にずれた場合もオフセットの単調性で検知する', () => {
    const values = [0, 40, 90, 150, 200];
    const loca = Buffer.alloc(values.length * 4);
    values.forEach((value, index) => {
      loca.writeUInt16BE(value, index * 4 + 1);
    });
    const font = buildFont([
      { tag: 'head', data: head(0) },
      { tag: 'maxp', data: maxp(values.length - 1) },
      { tag: 'loca', data: loca },
      { tag: 'glyf', data: Buffer.alloc(400, 1) },
    ]);

    expect(inspectEmbeddedFont(font).offsetsMonotonic).toBe(false);
  });

  it('輪郭が全て空のサブセット（字形が 1 つも入っていない）を検知する', () => {
    const report = inspectEmbeddedFont(buildFont(healthyTables([0, 0, 0, 0])));

    expect(report.offsetsMonotonic).toBe(true);
    expect(report.nonEmptyGlyphCount).toBe(0);
  });

  it('loca の最終オフセットが glyf 長を超えている場合を検知する', () => {
    const tables = healthyTables([80, 120]);
    const truncated = tables.map((table) =>
      table.tag === 'glyf' ? { tag: 'glyf', data: Buffer.alloc(50, 1) } : table,
    );

    expect(inspectEmbeddedFont(buildFont(truncated)).lastOffsetWithinGlyf).toBe(false);
  });

  it('必須テーブルが欠けている場合は原因が分かる形で失敗する', () => {
    const font = buildFont([
      { tag: 'head', data: head(1) },
      { tag: 'maxp', data: maxp(1) },
    ]);

    expect(() => inspectEmbeddedFont(font)).toThrow(/必須テーブルがない/);
  });

  it('テーブルレコードがサブセットの範囲外を指す場合は、どのテーブルかが分かる形で失敗する', () => {
    const font = buildFont(healthyTables([80, 120]));
    // glyf の offset だけをバッファ長より先へ書き換える。長さだけ見ていると
    // 健全と誤判定しうるので、offset + length の範囲で弾けることを固定する。
    const glyfRecord = findTableRecord(font, 'glyf');
    font.writeUInt32BE(font.length + 1024, glyfRecord + 8);

    expect(() => inspectEmbeddedFont(font)).toThrow(/glyf テーブルがサブセットの範囲外/);
  });

  it('indexToLocFormat が 0 / 1 以外なら失敗する', () => {
    const tables = healthyTables([80, 120]);
    const broken = tables.map((table) => (table.tag === 'head' ? { tag: 'head', data: head(7) } : table));

    expect(() => inspectEmbeddedFont(buildFont(broken))).toThrow(/indexToLocFormat が不正/);
  });

  it('loca のテーブル長がエントリ幅の倍数でない場合は失敗する', () => {
    // 32bit loca なのに長さが 4 の倍数でないと、末尾を切り捨てて読むことになる。
    const font = buildFont(healthyTables([80, 120]));
    const locaRecord = findTableRecord(font, 'loca');
    font.writeUInt32BE(font.readUInt32BE(locaRecord + 12) - 1, locaRecord + 12);

    expect(() => inspectEmbeddedFont(font)).toThrow(/loca テーブル長がエントリ幅の倍数でない/);
  });

  it('loca のエントリ数が numGlyphs + 1 と合わない場合を検知する', () => {
    // jsdom で実測した破損は loca が 126 エントリなのに numGlyphs + 1 = 521 だった。
    // オフセットの単調性だけに頼らず、この件数不一致でも落とせるようにしておく。
    const tables = healthyTables([80, 120, 160]);
    const inflated = tables.map((table) => (table.tag === 'maxp' ? { tag: 'maxp', data: maxp(64) } : table));

    const report = inspectEmbeddedFont(buildFont(inflated));

    expect(report.locaEntryCount).toBe(4);
    expect(report.numGlyphs).toBe(64);
    expect(report.locaCountMatchesNumGlyphs).toBe(false);
  });
});

/** /FontFile2 を 1 つ持つ最小の PDF らしきバイト列を組み立てる。 */
function buildPdfWithFontFile(streamBody: Buffer): Buffer {
  const header = Buffer.from('%PDF-1.7\n1 0 obj\n<< /FontFile2 2 0 R >>\nendobj\n', 'latin1');
  const objectHead = Buffer.from(
    `2 0 obj\n<< /Length ${streamBody.length} /Length1 ${streamBody.length * 2} /Filter /FlateDecode >>\nstream\n`,
    'latin1',
  );
  const objectTail = Buffer.from('\nendstream\nendobj\n', 'latin1');
  return Buffer.concat([header, objectHead, streamBody, objectTail]);
}

/** /Length を間接参照（`/Length 9 0 R`）で持つ形の PDF。 */
function buildPdfWithIndirectLength(streamBody: Buffer): Buffer {
  const header = Buffer.from('%PDF-1.7\n1 0 obj\n<< /FontFile2 2 0 R >>\nendobj\n', 'latin1');
  const objectHead = Buffer.from('2 0 obj\n<< /Length 9 0 R /Filter /FlateDecode >>\nstream\n', 'latin1');
  const objectTail = Buffer.from('\nendstream\nendobj\n', 'latin1');
  const lengthObject = Buffer.from(`9 0 obj\n${streamBody.length}\nendobj\n`, 'latin1');
  return Buffer.concat([header, objectHead, streamBody, objectTail, lengthObject]);
}

describe('extractEmbeddedTrueTypeFonts', () => {
  it('埋め込まれたサブセットを展開して取り出す', () => {
    const font = buildFont(healthyTables([80, 120]));

    const extracted = extractEmbeddedTrueTypeFonts(buildPdfWithFontFile(deflateSync(font)));

    expect(extracted).toHaveLength(1);
    expect(extracted[0].equals(font)).toBe(true);
  });

  it('圧縮データの末尾が改行コードでも 1 バイト欠けずに取り出す', () => {
    // stream の終端キーワードで切ると、末尾が 0x0D のときにその 1 バイトを区切りとして
    // 食ってしまい展開に失敗する。zlib の末尾は Adler-32 でほぼ一様なので、
    // 本文次第でごく稀に踏む。宣言された /Length で切っていれば起きない。
    const font = buildFont(healthyTables([80, 120]));
    const compressed = deflateSync(font);
    const endsWithCarriageReturn = Buffer.concat([compressed.subarray(0, compressed.length - 1), Buffer.from([0x0d])]);
    // 末尾 1 バイトを差し替えた時点で展開はできなくなるが、切り出しの長さは変わらない。
    const extracted = extractEmbeddedTrueTypeFonts(buildPdfWithFontFile(endsWithCarriageReturn));

    expect(extracted).toHaveLength(1);
    expect(extracted[0]).toHaveLength(endsWithCarriageReturn.length);
  });

  it('/Length が間接参照でも参照先を解決して取り出す', () => {
    // `/Length 9 0 R` を「直接値 9」と読み違えると 9 バイトで切ってしまう。
    // 否定先読みでこれを弾こうとするとバックトラックで通ってしまうため、
    // 間接参照を先に判定している。
    const font = buildFont(healthyTables([80, 120]));

    const extracted = extractEmbeddedTrueTypeFonts(buildPdfWithIndirectLength(deflateSync(font)));

    expect(extracted).toHaveLength(1);
    expect(extracted[0].equals(font)).toBe(true);
  });

  it('世代番号が 0 でない参照でも取り出す', () => {
    // `/FontFile2 12 1 R` を `12 0 obj` で探すと見つからない。世代番号まで見て引く。
    const font = buildFont(healthyTables([80, 120]));
    const body = deflateSync(font);
    const pdf = Buffer.concat([
      Buffer.from('%PDF-1.7\n1 0 obj\n<< /FontFile2 12 1 R >>\nendobj\n', 'latin1'),
      Buffer.from(`12 1 obj\n<< /Length 7 2 R /Filter /FlateDecode >>\nstream\n`, 'latin1'),
      body,
      Buffer.from('\nendstream\nendobj\n', 'latin1'),
      Buffer.from(`7 2 obj\n${body.length}\nendobj\n`, 'latin1'),
    ]);

    const extracted = extractEmbeddedTrueTypeFonts(pdf);

    expect(extracted).toHaveLength(1);
    expect(extracted[0].equals(font)).toBe(true);
  });

  it('辞書に /Length1 が併記されていても /Length を取り違えない', () => {
    // `/Length1` は Type1 系フォントの非圧縮長。`\s` を要求しているので拾わない。
    const font = buildFont(healthyTables([80, 120, 64]));

    const extracted = extractEmbeddedTrueTypeFonts(buildPdfWithFontFile(deflateSync(font)));

    expect(extracted).toHaveLength(1);
    expect(extracted[0].equals(font)).toBe(true);
  });

  it('/Length が全く宣言されていない場合、本体に紛れた "endstream" 文字列で誤って切り詰めない', () => {
    // /Length が読めないと安全に境界を決められない。以前は `\nendstream` を探して
    // 代用していたが、無圧縮ストリーム本体に偶然そのバイト列が含まれると、そこを
    // 本物の終端と誤認して途中で切り詰めていた。安全に決められないなら抽出しない。
    const font = buildFont(healthyTables([80, 120]));
    // 本体（無圧縮のまま埋める）に "\nendstream" を混入させ、本物の終端より手前に
    // 偽の終端を作る。
    const bodyWithDecoy = Buffer.concat([font, Buffer.from('\nendstream', 'latin1'), font]);
    const header = Buffer.from('%PDF-1.7\n1 0 obj\n<< /FontFile2 2 0 R >>\nendobj\n', 'latin1');
    const objectHead = Buffer.from('2 0 obj\n<< >>\nstream\n', 'latin1');
    const objectTail = Buffer.from('\nendstream\nendobj\n', 'latin1');
    const pdf = Buffer.concat([header, objectHead, bodyWithDecoy, objectTail]);

    const extracted = extractEmbeddedTrueTypeFonts(pdf);

    expect(extracted).toHaveLength(0);
  });
});
