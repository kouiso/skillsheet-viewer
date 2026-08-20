// TrueType の cmap テーブルから「字形を持つコードポイント」を読み出す最小実装。
//
// なぜ自前で読むのか: glyph-coverage.ts に焼き込んだ収録表がフォント差し替えで
// 静かに古くなるのを防ぐには、実フォントから作り直した表と突き合わせる検証が要る。
// fontkit は @react-pdf の推移的依存でしかなく apps/web からは解決できないため、
// 検証に必要な範囲（format 4 / format 12 のサブテーブル）だけをここで読む。
// 描画には一切使わず、glyph-coverage.node.test.tsx からのみ参照する。

const SFNT_HEADER_BYTES = 12;
const TABLE_RECORD_BYTES = 16;

function findTable(font: Buffer, wanted: string): { offset: number; length: number } | null {
  if (font.length < SFNT_HEADER_BYTES) return null;
  const numTables = font.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const record = SFNT_HEADER_BYTES + i * TABLE_RECORD_BYTES;
    if (record + TABLE_RECORD_BYTES > font.length) break;
    if (font.toString('latin1', record, record + 4) === wanted) {
      return { offset: font.readUInt32BE(record + 8), length: font.readUInt32BE(record + 12) };
    }
  }
  return null;
}

function readFormat4(font: Buffer, at: number, out: Set<number>): void {
  const segCountX2 = font.readUInt16BE(at + 6);
  const segCount = segCountX2 / 2;
  const endAt = at + 14;
  const startAt = endAt + segCountX2 + 2;
  const deltaAt = startAt + segCountX2;
  const rangeAt = deltaAt + segCountX2;
  for (let seg = 0; seg < segCount; seg++) {
    const end = font.readUInt16BE(endAt + seg * 2);
    const start = font.readUInt16BE(startAt + seg * 2);
    if (start > end) continue;
    const delta = font.readInt16BE(deltaAt + seg * 2);
    const rangeOffset = font.readUInt16BE(rangeAt + seg * 2);
    for (let code = start; code <= end && code !== 0x10000; code++) {
      let glyph: number;
      if (rangeOffset === 0) {
        glyph = (code + delta) & 0xffff;
      } else {
        const glyphAt = rangeAt + seg * 2 + rangeOffset + (code - start) * 2;
        if (glyphAt + 2 > font.length) continue;
        const raw = font.readUInt16BE(glyphAt);
        glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
      }
      if (glyph !== 0) out.add(code);
    }
  }
}

function readFormat12(font: Buffer, at: number, out: Set<number>): void {
  const groupCount = font.readUInt32BE(at + 12);
  for (let i = 0; i < groupCount; i++) {
    const group = at + 16 + i * 12;
    if (group + 12 > font.length) break;
    const start = font.readUInt32BE(group);
    const end = font.readUInt32BE(group + 4);
    const startGlyph = font.readUInt32BE(group + 8);
    for (let code = start; code <= end; code++) {
      if (startGlyph + (code - start) !== 0) out.add(code);
    }
  }
}

/** フォントが字形を持つコードポイントの集合（Unicode 系サブテーブルのみを見る）。 */
export function readCoveredCodePoints(font: Buffer): Set<number> {
  const covered = new Set<number>();
  const cmap = findTable(font, 'cmap');
  if (!cmap) return covered;
  const numSubtables = font.readUInt16BE(cmap.offset + 2);
  for (let i = 0; i < numSubtables; i++) {
    const record = cmap.offset + 4 + i * 8;
    const platform = font.readUInt16BE(record);
    const encoding = font.readUInt16BE(record + 2);
    // Unicode(0) の各エンコーディングと、Windows(3) の BMP(1) / UCS-4(10) だけを読む。
    const isUnicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!isUnicode) continue;
    const at = cmap.offset + font.readUInt32BE(record + 4);
    const format = font.readUInt16BE(at);
    if (format === 4) readFormat4(font, at, covered);
    else if (format === 12) readFormat12(font, at, covered);
    // format 14（異体字シーケンス）は基底文字の収録判定には寄与しないので読まない。
  }
  return covered;
}
