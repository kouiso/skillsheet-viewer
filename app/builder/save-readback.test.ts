import { describe, expect, it, vi } from 'vitest';
import { saveWithReadback } from './save-readback';

const payload = { sheetId: 'sheet-a', expectedRevision: '9007199254740993', title: '原文', blocks: [] };
const snapshot = {
  sheetId: payload.sheetId,
  revision: '9007199254740994',
  title: payload.title,
  blocks: [],
  validation: { editable: true, issues: [] },
};
describe('保存応答喪失の読戻し', () => {
  it('成功応答では読戻しを増やさない', async () => {
    const read = vi.fn();
    expect(await saveWithReadback(payload, vi.fn().mockResolvedValue(snapshot), read)).toEqual(snapshot);
    expect(read).not.toHaveBeenCalled();
  });
  it('失敗応答でも同ID・進んだ版・同じ内容なら保存済みsnapshotを返す', async () => {
    const save = vi.fn().mockRejectedValue(new Error('response lost'));
    const read = vi.fn().mockResolvedValue({ status: 'OK', snapshot });
    expect(await saveWithReadback(payload, save, read)).toEqual(snapshot);
    expect(save).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledWith(payload.sheetId);
  });
  it.each([
    { ...snapshot, sheetId: 'sheet-b' },
    { ...snapshot, title: '別編集' },
    { ...snapshot, revision: payload.expectedRevision },
    { ...snapshot, revision: 'invalid' },
  ])('別ID・別内容・進んでいない版は成功にしない', async (current) => {
    const error = new Error('CONFLICT');
    await expect(
      saveWithReadback(
        payload,
        vi.fn().mockRejectedValue(error),
        vi.fn().mockResolvedValue({ status: 'OK', snapshot: current }),
      ),
    ).rejects.toBe(error);
  });
  it('削除済みや読戻し失敗では元のエラーを保持する', async () => {
    const error = new Error('response lost');
    for (const read of [
      vi.fn().mockResolvedValue({ status: 'NOT_FOUND' }),
      vi.fn().mockRejectedValue(new Error('offline')),
    ]) {
      await expect(saveWithReadback(payload, vi.fn().mockRejectedValue(error), read)).rejects.toBe(error);
    }
  });
});
