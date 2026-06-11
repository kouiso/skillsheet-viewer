import { type Metadata } from 'next';

import { type SheetMeta } from '@/server/github-sheets';
import { getCachedSheets } from '@/server/sheets-cache';

import SheetsListClient from './sheets-list-client';

export const metadata: Metadata = {
  title: 'スキルシート一覧 | エンジニアスキルシート',
};

export default async function SheetsListPage() {
  // この一覧は静的プリレンダ対象のため throw でビルドを止めず、取得失敗は error 状態として渡す。
  // listSheets() は真に空のリポジトリのみ [] を返し、システムエラー時は throw するので、
  // 「0件」と「取得失敗」をクライアントで別UIに分岐できる（誤って空表示しない）。
  let sheets: SheetMeta[] = [];
  let hasError = false;
  try {
    sheets = await getCachedSheets();
  } catch (err) {
    console.error('Failed to fetch sheets:', err);
    hasError = true;
  }
  return <SheetsListClient initialSheets={sheets} hasError={hasError} />;
}
