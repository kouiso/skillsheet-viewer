/** 文書API共通の設定・表示型。DB操作はdocument-serviceを使う。 */
export { fetchMarkdownFromGitHub, getGitHubSeedConfig, isGitHubSeedConfigured } from './github-seed';

/** 明示IDの不存在。閲覧キャッシュで古い文書へfallbackしないために識別する。 */
export class SkillSheetNotFoundError extends Error {
  constructor(sheetId: string) {
    super(`Sheet not found: ${sheetId}`);
    this.name = 'SkillSheetNotFoundError';
  }
}

/** 限定DB関数へ渡す期待owner。認可自体はSESSION_USERとのDB側照合で行う。 */
export function getOwnerId(): string {
  const id = process.env.SKILLSHEET_OWNER_ID;
  if (!id) throw new Error('SKILLSHEET_OWNER_ID is not set');
  return id;
}

export interface SheetSummary {
  id: string;
  title: string;
  updatedAt: Date;
}

export const TITLE = 'エンジニアスキルシート';
