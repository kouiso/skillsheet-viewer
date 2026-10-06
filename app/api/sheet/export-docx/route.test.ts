import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasViewerSession: vi.fn(),
  isEditor: vi.fn(),
  getDb: vi.fn(),
  getOwnerId: vi.fn(),
  readViewerDocument: vi.fn(),
  buildSkillSheetDocx: vi.fn(),
}));

vi.mock('@/server/viewer-gate', () => ({ hasViewerSession: mocks.hasViewerSession }));
vi.mock('@/server/auth-gate', () => ({ isEditor: mocks.isEditor }));
vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>();
  return { ...actual, getDb: mocks.getDb, getOwnerId: mocks.getOwnerId };
});
vi.mock('@/server/document-view', () => ({ readViewerDocument: mocks.readViewerDocument }));
vi.mock('@/lib/export/build-docx', () => ({ buildSkillSheetDocx: mocks.buildSkillSheetDocx }));

import { GET } from './route';

const req = (url: string) => new NextRequest(url, { headers: { host: 'localhost:3000' } });
const DOC = { title: 'スキルシート', content: '', blocks: [], revision: '1', referenceMonth: 24320 };

describe('GET /api/sheet/export-docx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockReturnValue('db-handle');
    mocks.getOwnerId.mockReturnValue('owner-1');
    mocks.readViewerDocument.mockResolvedValue(DOC);
  });

  it('閲覧 cookie でも編集者でも無ければ 401', async () => {
    mocks.hasViewerSession.mockResolvedValue(false);
    mocks.isEditor.mockResolvedValue(false);
    const res = await GET(req('http://localhost:3000/api/sheet/export-docx'));
    expect(res.status).toBe(401);
    expect(mocks.readViewerDocument).not.toHaveBeenCalled();
  });

  it('閲覧者は docx を受け取れる（Content-Disposition と Content-Type を見る）', async () => {
    mocks.hasViewerSession.mockResolvedValue(true);
    mocks.isEditor.mockResolvedValue(false);
    mocks.buildSkillSheetDocx.mockResolvedValue(Buffer.from('PK-fake'));

    const id = '11111111-1111-4111-8111-111111111111';
    const res = await GET(req(`http://localhost:3000/api/sheet/export-docx?id=${id}`));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    expect(res.headers.get('Content-Disposition')).toContain(encodeURIComponent('スキルシート.docx'));
    expect(mocks.readViewerDocument).toHaveBeenCalledWith('db-handle', 'owner-1', id);
    expect(mocks.buildSkillSheetDocx).toHaveBeenCalledWith([], 'スキルシート', 24320);
  });

  it('id が UUID でなければ 400、存在しなければ 404', async () => {
    mocks.hasViewerSession.mockResolvedValue(true);
    const bad = await GET(req('http://localhost:3000/api/sheet/export-docx?id=not-a-uuid'));
    expect(bad.status).toBe(400);

    const { SkillSheetNotFoundError } = await import('@/db');
    mocks.readViewerDocument.mockRejectedValue(new SkillSheetNotFoundError('11111111-1111-4111-8111-111111111111'));
    const missing = await GET(
      req('http://localhost:3000/api/sheet/export-docx?id=11111111-1111-4111-8111-111111111111'),
    );
    expect(missing.status).toBe(404);
  });

  it('edition=digest は未提供として 400、不明値も 400 でビルダーを呼ばない', async () => {
    mocks.hasViewerSession.mockResolvedValue(true);
    mocks.isEditor.mockResolvedValue(false);
    const id = '11111111-1111-4111-8111-111111111111';

    const digest = await GET(req(`http://localhost:3000/api/sheet/export-docx?id=${id}&edition=digest`));
    expect(digest.status).toBe(400);

    const unknown = await GET(req(`http://localhost:3000/api/sheet/export-docx?id=${id}&edition=half`));
    expect(unknown.status).toBe(400);

    expect(mocks.buildSkillSheetDocx).not.toHaveBeenCalled();
  });

  it('edition 省略は既定シート、edition=full は指定 id をビルダーで出す', async () => {
    mocks.hasViewerSession.mockResolvedValue(true);
    mocks.isEditor.mockResolvedValue(false);
    mocks.buildSkillSheetDocx.mockResolvedValue(Buffer.from('PK-full'));

    const def = await GET(req('http://localhost:3000/api/sheet/export-docx'));
    expect(def.status).toBe(200);
    expect(mocks.readViewerDocument).toHaveBeenCalledWith('db-handle', 'owner-1', null);

    const id = '11111111-1111-4111-8111-111111111111';
    const full = await GET(req(`http://localhost:3000/api/sheet/export-docx?id=${id}&edition=full`));
    expect(full.status).toBe(200);
    expect(mocks.readViewerDocument).toHaveBeenCalledWith('db-handle', 'owner-1', id);
    expect(mocks.buildSkillSheetDocx).toHaveBeenCalledTimes(2);
  });
});
