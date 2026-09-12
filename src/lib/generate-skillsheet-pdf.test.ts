import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSkillSheetPdfBlob } from './generate-skillsheet-pdf';

const { createDocument, toBlob, resetFonts, renderPdf } = vi.hoisted(() => ({
  createDocument: vi.fn(),
  toBlob: vi.fn(),
  resetFonts: vi.fn(),
  renderPdf: vi.fn(),
}));
vi.mock('@/components/pdf-export', () => ({
  createSkillSheetPdf: createDocument,
  resetPdfFontsAfterFailure: resetFonts,
}));
vi.mock('@react-pdf/renderer', () => ({ pdf: renderPdf }));

beforeEach(() => {
  vi.resetAllMocks();
  createDocument.mockResolvedValue({ type: 'document' });
  renderPdf.mockReturnValue({ toBlob });
  toBlob.mockResolvedValue(new Blob(['synthetic']));
});

describe('generateSkillSheetPdfBlob', () => {
  it('表示設定と基準月を文書生成へ渡し、生成したBlobを返す', async () => {
    const input = { title: '合成シート', content: '# 合成', views: [], referenceMonth: 24320 };
    const blob = new Blob(['synthetic']);
    toBlob.mockResolvedValue(blob);
    expect(await generateSkillSheetPdfBlob(input)).toBe(blob);
    expect(createDocument).toHaveBeenCalledWith(input);
    expect(renderPdf).toHaveBeenCalledWith({ type: 'document' });
    expect(resetFonts).not.toHaveBeenCalled();
  });

  it.each(['document', 'blob'])('%s生成の失敗を復旧して同じエラーを返し、再試行できる', async (stage) => {
    const error = new Error('synthetic failure');
    (stage === 'document' ? createDocument : toBlob).mockRejectedValueOnce(error);
    const input = { title: '合成', content: '' };
    await expect(generateSkillSheetPdfBlob(input)).rejects.toBe(error);
    expect(resetFonts).toHaveBeenCalledTimes(1);
    await expect(generateSkillSheetPdfBlob(input)).resolves.toBeInstanceOf(Blob);
    expect(resetFonts).toHaveBeenCalledTimes(1);
  });
});
