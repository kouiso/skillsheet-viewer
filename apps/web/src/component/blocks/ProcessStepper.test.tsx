import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProcessStepper } from './ProcessStepper';

describe('ProcessStepper', () => {
  it('ラベルに whitespace-nowrap を使わない（320px 幅での隣接ラベル重なり回帰防止）', () => {
    render(<ProcessStepper done={[false, false, false, false, false, false, false]} uncertain={[]} />);

    const expectedLabels = ['要件定義', '基本設計', '詳細設計', '実装・単体', '結合テスト', '総合テスト', '保守・運用'];
    for (const expectedLabel of expectedLabels) {
      const label = screen.getByText(expectedLabel);
      expect(label.className).not.toContain('whitespace-nowrap');
      expect(label.className).toContain('text-center');
    }
  });

  it('compact=true のときラベルを描画しない', () => {
    render(<ProcessStepper done={[true, false, false, false, false, false, false]} uncertain={[]} compact />);
    expect(screen.queryByText('要件定義')).toBeNull();
  });
});
