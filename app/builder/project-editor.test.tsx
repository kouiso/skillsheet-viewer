import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectBlockData } from '@/db/block';

import { ProjectEditor } from './project-editor';

vi.mock('./project-form', () => ({
  CompanyBar: () => null,
  ProjectForm: () => null,
}));

const mockData: ProjectBlockData = {
  companies: [{ id: 'co-1', name: 'テスト会社', kind: 'SI', period: '2024', note: '', hidden: false }],
  items: [
    {
      id: 'pj-1',
      companyId: 'co-1',
      title: 'テスト案件',
      scope: '',
      period: '2024.01-2024.12',
      role: '',
      team: '',
      tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] },
      process: [],
      duties: '',
      acquired: '',
      comment: '',
      summary: '',
      duration: '',
      hidden: false,
    },
  ],
};

const setNarrow = (matches: boolean) => {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: query === '(max-width: 860px)' ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

describe('ProjectEditor 狭幅対応', () => {
  it('会社削除の確認に全案件を表示し、取消では保存せず承認後だけ関連データを削除する', async () => {
    const change = vi.fn();
    const data = {
      ...mockData,
      items: Array.from({ length: 12 }, (_, index) => ({
        ...mockData.items[0],
        id: `p-${index}`,
        title: `合成案件${index}`,
        hidden: index === 11,
      })),
    };
    render(<ProjectEditor data={data} onChange={change} showPreview={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'テスト会社 を削除' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(12);
    expect(within(dialog).getByText('合成案件11（非表示）')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'やめる' }));
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'テスト会社 を削除' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '会社と案件を削除' }));
    await waitFor(() => expect(change).toHaveBeenCalledExactlyOnceWith({ companies: [], items: [] }));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    setNarrow(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('広幅では通常ナビが表示される', () => {
    render(<ProjectEditor data={mockData} onChange={vi.fn()} onSelectionChange={vi.fn()} showPreview={false} />);
    expect(screen.getByTitle('集中モード（ナビを畳む）')).toBeInTheDocument();
  });

  it('狭幅ではレールナビが表示され、展開でドロワーが開く', async () => {
    setNarrow(true);
    render(<ProjectEditor data={mockData} onChange={vi.fn()} onSelectionChange={vi.fn()} showPreview={false} />);
    const expand = screen.getByRole('button', { name: 'ナビを展開' });
    expect(expand).toBeInTheDocument();

    fireEvent.click(expand);
    await waitFor(() => expect(screen.getByRole('dialog', { name: '案件ナビ' })).toBeInTheDocument());

    // ドロワー外クリックで閉じる
    fireEvent.click(screen.getByLabelText('ナビを閉じる'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '案件ナビ' })).not.toBeInTheDocument());
  });
});
