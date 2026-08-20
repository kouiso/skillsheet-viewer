import remarkBreaks from 'remark-breaks';
import remarkCjkFriendly from 'remark-cjk-friendly';
import remarkGfm from 'remark-gfm';
import { describe, expect, it } from 'vitest';

import { MARKDOWN_REMARK_PLUGINS, PDF_REMARK_PLUGINS } from './markdown-config';

// PDF の行重なりは「remark-breaks が単独改行を <br> にする」ことが原因で、症状は
// レンダリング後の座標にしか出ない。@react-pdf を動かすテストは重いうえ %PDF が
// 出れば通ってしまうので、原因そのもの（プラグイン構成）を直接固定しておく。
describe('remark プラグイン構成', () => {
  it('PDF 側は remark-breaks を含まない（<br> と Text 内の改行が二重になり行が重なる）', () => {
    expect(PDF_REMARK_PLUGINS).not.toContain(remarkBreaks);
  });

  it('ビューア側は remark-breaks を含む（入力どおりの改行で読ませる）', () => {
    expect(MARKDOWN_REMARK_PLUGINS).toContain(remarkBreaks);
  });

  it('GFM と CJK 強調は画面と PDF で同じにする', () => {
    for (const plugins of [MARKDOWN_REMARK_PLUGINS, PDF_REMARK_PLUGINS]) {
      expect(plugins).toContain(remarkGfm);
      expect(plugins).toContain(remarkCjkFriendly);
    }
  });
});
