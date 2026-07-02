import type { BlockInput } from '@skillsheet/db/blocks';

export interface SheetTemplate {
  id: string;
  label: string;
  blocks: BlockInput[];
}

export const TEMPLATES: SheetTemplate[] = [
  {
    id: 'blank',
    label: '空白',
    blocks: [],
  },
  {
    id: 'profile',
    label: '技術者プロファイル',
    blocks: [
      {
        type: 'markdown',
        data: { markdown: '## 技術者プロファイル' },
      },
      {
        type: 'table',
        data: {
          columns: [
            { label: '項目', align: 'left' },
            { label: '内容', align: 'left' },
          ],
          rows: [
            ['氏名', ''],
            ['年齢', ''],
            ['最寄り駅', ''],
            ['稼働状況', ''],
          ],
        },
      },
    ],
  },
  {
    id: 'full',
    label: 'フルスキルシート',
    blocks: [
      {
        type: 'markdown',
        data: { markdown: '## 技術者プロファイル' },
      },
      {
        type: 'table',
        data: {
          columns: [
            { label: '項目', align: 'left' },
            { label: '内容', align: 'left' },
          ],
          rows: [
            ['氏名', ''],
            ['年齢', ''],
            ['最寄り駅', ''],
            ['稼働状況', ''],
          ],
        },
      },
      {
        type: 'markdown',
        data: { markdown: '## スキル・経験年数' },
      },
      {
        type: 'skills',
        data: {
          category: 'プログラミング言語',
          skills: [{ name: '', years: 0, level: '' }],
        },
      },
      {
        type: 'skills',
        data: {
          category: 'フレームワーク・ライブラリ',
          skills: [{ name: '', years: 0, level: '' }],
        },
      },
      {
        type: 'markdown',
        data: { markdown: '## 職務経歴' },
      },
      {
        type: 'experience',
        data: {
          company: '',
          startDate: '',
          endDate: '',
          role: '',
          description: '',
        },
      },
    ],
  },
  {
    id: 'console-dashboard',
    label: 'ダッシュボード（プロフィール・統計・案件）',
    blocks: [
      {
        type: 'profile',
        data: { name: '', title: '', pr: '', strengths: [], meta: {} },
      },
      {
        type: 'stats',
        data: { items: [] },
      },
      {
        type: 'skills',
        data: { category: 'プログラミング言語', skills: [{ name: '', years: 0, level: '' }] },
      },
      {
        type: 'project',
        data: { companies: [], items: [] },
      },
    ],
  },
];

export function getTemplate(id: string): SheetTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
