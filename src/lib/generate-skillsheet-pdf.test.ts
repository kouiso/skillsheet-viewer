import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSkillSheetPdfBlob } from './generate-skillsheet-pdf';

const { createDocument, toBlob, resetFonts, renderPdf } = vi.hoisted(() => ({
  createDocument: vi.fn(),
  toBlob: vi.fn(),
  resetFonts: vi.fn(),
  renderPdf: vi.fn(),
}));
vi.mock('@/component/pdf-export', () => ({
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

it('終了済みの期間矛盾では描画・フォント取得へ進まず、原文を保持する', async () => {
  const input: import('@/component/pdf-export').SkillSheetPDFProps = {
    title: '合成',
    content: '',
    referenceMonth: 24320,
    blocks: [
      {
        id: 'block',
        order: 0,
        type: 'project',
        data: {
          companies: [],
          items: [
            {
              id: 'project',
              companyId: 'company',
              title: '案件',
              scope: '',
              period: '2026.01 — 2026.03',
              duration: '9ヶ月',
              role: '',
              team: '',
              process: [],
              duties: '',
              acquired: '',
              comment: '',
              tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] },
            },
          ],
        },
      },
    ],
  };
  const original = JSON.stringify(input);
  await expect(generateSkillSheetPdfBlob(input)).rejects.toMatchObject({ name: 'PdfDurationConflictError' });
  expect(createDocument).not.toHaveBeenCalled();
  expect(renderPdf).not.toHaveBeenCalled();
  expect(JSON.stringify(input)).toBe(original);
  // 非表示の案件は提出物の矛盾ゲートに含めない。
  await expect(generateSkillSheetPdfBlob({ ...input, views: ['skills'] })).resolves.toBeInstanceOf(Blob);
  const block = input.blocks?.[0];
  if (block?.type !== 'project') throw new Error('fixture');
  block.data.items[0].period = '2026.01 — 現在';
  await expect(generateSkillSheetPdfBlob(input)).resolves.toBeInstanceOf(Blob);
});

it('構造化案件の出力は固定月がないまま開始しない', async () => {
  await expect(generateSkillSheetPdfBlob({ title: '合成', content: '', blocks: [] })).rejects.toThrow(
    'INVALID_REFERENCE_MONTH',
  );
  expect(createDocument).not.toHaveBeenCalled();
});
