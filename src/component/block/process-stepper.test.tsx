import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProcessStepper } from './process-stepper';

describe('ProcessStepper', () => {
  it('ラベルに whitespace-nowrap を使わない（320px 幅での隣接ラベル重なり回帰防止）', () => {
    render(<ProcessStepper done={[false, false, false, false, false, false, false]} />);

    const expectedLabels = ['要件定義', '基本設計', '詳細設計', '実装・単体', '結合テスト', '総合テスト', '保守・運用'];
    for (const expectedLabel of expectedLabels) {
      // ラベルは「・」の後に <wbr /> を挟むため子 span に分割される。外側の span を対象にする。
      const label = screen.getByText(
        (_, el) => el?.tagName === 'SPAN' && el.textContent === expectedLabel && el.className.includes('text-center'),
      );
      expect(label.className).not.toContain('whitespace-nowrap');
      expect(label.className).toContain('text-center');
      // 語中折れ防止: break-keep + ・直後だけの折り返し点を持つ。
      expect(label.className).toContain('break-keep');
    }
  });

  it('compact=true のときラベルを描画しない', () => {
    render(<ProcessStepper done={[true, false, false, false, false, false, false]} compact />);
    expect(screen.queryByText('要件定義')).toBeNull();
  });

  it('320px 幅では4列グリッドに折り返す（#144: 7等分だと1文字ずつ縦積みになる回帰防止）', () => {
    const { container } = render(<ProcessStepper done={[false, false, false, false, false, false, false]} />);
    const grid = container.firstElementChild;
    expect(grid?.className).toContain('grid-cols-4');
    expect(grid?.className).toContain('sm:grid-cols-7');
    // 7等分フレックス（flex-1 が7要素に均等配分される）へ戻っていないことも確認する。
    expect(grid?.className).not.toContain('flex-1');
  });
});
