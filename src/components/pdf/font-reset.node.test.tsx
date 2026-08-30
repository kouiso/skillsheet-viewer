/**
 * PDF 生成が一度失敗したあとの後始末が、標準フォントの登録まで巻き込まないことを固定する。
 *
 * `Font.clear()` / `Font.reset()` は登録済みファミリを丸ごと空にするため標準 14 フォントも
 * 消え、2 回目の生成が `Font family not registered: Helvetica` で落ちる（実測で再現）。
 * jsdom 側では `@react-pdf/renderer` の Font を触れないので、この検証は node 側に置く。
 */
import { Font } from '@react-pdf/renderer';
import { describe, expect, it } from 'vitest';

import registerPdfFonts, { resetPdfFontsAfterFailure } from './fonts';

describe('resetPdfFontsAfterFailure', () => {
  it('標準フォントの登録は残す', () => {
    registerPdfFonts();
    resetPdfFontsAfterFailure();
    expect(Font.getRegisteredFontFamilies()).toContain('Helvetica');
  });

  it('アプリが登録したファミリだけを消し、次の登録をやり直せる状態に戻す', () => {
    registerPdfFonts();
    resetPdfFontsAfterFailure();
    const cleared = Font.getRegisteredFontFamilies();
    registerPdfFonts();
    const reregistered = Font.getRegisteredFontFamilies();
    expect(reregistered.length).toBe(cleared.length + 1);
  });
});
