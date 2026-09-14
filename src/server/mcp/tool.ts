// クライアントバンドルに巻き込まれた瞬間にビルドを失敗させる。
import 'server-only';

/**
 * Remote MCP ツール定義（Issue #305）。
 *
 * 各ツールはサービス層（src/server/sheet-service.ts）だけを呼ぶ。DB・tRPC には
 * 直接触れない。エラーはサービス層の SheetServiceError / db 層の
 * SkillSheetNotFoundError / ConflictError を isError 結果へマップする。
 */

import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { ConflictError, SkillSheetNotFoundError } from '@/db';
import {
  addProjectItem,
  getOwnerSheet,
  listOwnerSheets,
  reorderProjectItems,
  SheetServiceError,
  searchProjects,
  updateCompany,
  updateProjectItem,
  updateStatsItem,
} from '@/server/sheet-service';

/** tools/call の tool 名 → 必要スコープ（handler 側の境界チェックでも使う）。 */
export const READ_TOOLS = ['list_sheets', 'get_sheet', 'search_projects'] as const;
export const WRITE_TOOLS = [
  'update_project_item',
  'update_company',
  'update_stats',
  'add_project_item',
  'reorder_project_items',
] as const;

export type McpToolName = (typeof READ_TOOLS)[number] | (typeof WRITE_TOOLS)[number];

// sheetId は DB の uuid 列。uuid 以外をそのまま Postgres に投げると SQLSTATE 22P02 で
// 500 になるため、入力境界で弾く（src/server/trpc/schema.ts の sheetIdSchema と同じ理由）。
const sheetIdField = z.uuid().describe('スキルシート ID（list_sheets の戻り値）');

// 書き込みツールは expectedUpdatedAt を必須とする（tRPC の save では optional だが、
// MCP では楽観ロックを強制する — 設計: Issue #305）。ISO 8601 日時文字列で受け、
// Date へ正規化してからサービス層へ渡す。
const expectedUpdatedAtField = z
  .string()
  .describe('直前に取得したシートの updatedAt（ISO 8601）。現在値と一致しない場合は CONFLICT で保存しない');

const techShape = {
  lang: z.array(z.string()).optional().describe('言語'),
  fw: z.array(z.string()).optional().describe('フレームワーク'),
  db: z.array(z.string()).optional().describe('データベース'),
  infra: z.array(z.string()).optional().describe('インフラ'),
  tools: z.array(z.string()).optional().describe('ツール'),
  collab: z.array(z.string()).optional().describe('コラボレーション'),
};

function okResult(payload: unknown): CallToolResult {
  const text = JSON.stringify(payload, null, 2);
  return { content: [{ type: 'text', text }], structuredContent: payload as Record<string, unknown> };
}

/**
 * 業務エラーを MCP の isError 結果へ変換する。設計のエラー規約:
 * 対象なし NOT_FOUND / 入力不正 BAD_REQUEST / 競合 CONFLICT。
 * 未知の内部例外は詳細を出さず re-throw する（SDK が INTERNAL_ERROR にする）。
 */
function toErrorResult(err: unknown): CallToolResult {
  if (err instanceof SheetServiceError) {
    return { isError: true, content: [{ type: 'text', text: `${err.code}: ${err.message}` }] };
  }
  if (err instanceof SkillSheetNotFoundError) {
    return { isError: true, content: [{ type: 'text', text: `NOT_FOUND: ${err.message}` }] };
  }
  if (err instanceof ConflictError) {
    return {
      isError: true,
      content: [{ type: 'text', text: 'CONFLICT: シートが他で更新されています。最新を取得してから再試行してください' }],
    };
  }
  throw err;
}

async function runTool(fn: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return okResult(await fn());
  } catch (err) {
    return toErrorResult(err);
  }
}

function serializeDate(d: Date): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

function serializeWriteResult(result: { sheetId: string; targetId: string; updatedAt: Date; changes: unknown[] }) {
  return { ...result, updatedAt: serializeDate(result.updatedAt) };
}

export function registerSkillsheetTools(server: McpServer): void {
  server.registerTool(
    'list_sheets',
    {
      description:
        'オーナーのスキルシート一覧を返す（id / title / updatedAt）。updatedAt は書き込みツールの expectedUpdatedAt に使う。',
      inputSchema: {},
    },
    async () =>
      runTool(async () => {
        const sheets = await listOwnerSheets();
        return { sheets: sheets.map((s) => ({ id: s.id, title: s.title, updatedAt: serializeDate(s.updatedAt) })) };
      }),
  );

  server.registerTool(
    'get_sheet',
    {
      description:
        '指定シートの全ブロックを返す（hidden 含む編集者向けの全件）。updatedAt は書き込みツールの expectedUpdatedAt に使う。',
      inputSchema: { sheetId: sheetIdField },
    },
    async ({ sheetId }) =>
      runTool(async () => {
        const sheet = await getOwnerSheet(sheetId);
        return {
          id: sheet.id,
          title: sheet.title,
          updatedAt: serializeDate(sheet.updatedAt),
          blocks: sheet.blocks,
        };
      }),
  );

  server.registerTool(
    'search_projects',
    {
      description:
        '案件名・会社名・技術名の完全一致で候補を返す。各ヒットは projectId と companyId を必ず含む（会社のみ一致で配下案件が無いとき projectId は null）。',
      inputSchema: {
        query: z.string().describe('完全一致させる案件名・会社名・技術名'),
        sheetId: sheetIdField.optional().describe('省略時はオーナーの全シートを対象にする'),
      },
    },
    async ({ query, sheetId }) => runTool(() => searchProjects(query, sheetId)),
  );

  server.registerTool(
    'update_project_item',
    {
      description: '案件 1 件の指定フィールドだけを更新する（1 回につき 1 案件）。成功時は変更差分を返す。',
      inputSchema: {
        sheetId: sheetIdField,
        projectId: z.string().describe('案件 ID（get_sheet / search_projects の戻り値）'),
        expectedUpdatedAt: expectedUpdatedAtField,
        fields: z
          .object({
            companyId: z.string().optional().describe('所属会社 ID（存在する会社 ID のみ）'),
            title: z.string().optional(),
            scope: z.string().optional(),
            period: z.string().optional(),
            role: z.string().optional(),
            team: z.string().optional(),
            tech: z.object(techShape).partial().optional().describe('指定したキーだけ置き換える'),
            process: z.array(z.string()).optional(),
            duties: z.string().optional(),
            acquired: z.string().optional(),
            comment: z.string().optional(),
            summary: z.string().optional(),
            duration: z.string().optional(),
            hidden: z.boolean().optional().describe('true で閲覧面から非表示にする（削除ではなくこれを使う）'),
            periodStart: z.string().optional(),
            periodEnd: z.string().optional(),
            ongoing: z.boolean().optional(),
          })
          .describe('更新したいフィールドだけを指定する'),
      },
    },
    async ({ sheetId, projectId, expectedUpdatedAt, fields }) =>
      runTool(async () =>
        serializeWriteResult(
          await updateProjectItem({ sheetId, projectId, expectedUpdatedAt: new Date(expectedUpdatedAt), fields }),
        ),
      ),
  );

  server.registerTool(
    'update_company',
    {
      description: '会社 1 社の指定フィールドだけを更新する（1 回につき 1 会社）。成功時は変更差分を返す。',
      inputSchema: {
        sheetId: sheetIdField,
        companyId: z.string().describe('会社 ID'),
        expectedUpdatedAt: expectedUpdatedAtField,
        fields: z
          .object({
            name: z.string().optional(),
            kind: z.string().optional(),
            period: z.string().optional(),
            note: z.string().optional(),
            hidden: z.boolean().optional().describe('true で配下案件ごと閲覧面から非表示にする'),
          })
          .describe('更新したいフィールドだけを指定する'),
      },
    },
    async ({ sheetId, companyId, expectedUpdatedAt, fields }) =>
      runTool(async () =>
        serializeWriteResult(
          await updateCompany({ sheetId, companyId, expectedUpdatedAt: new Date(expectedUpdatedAt), fields }),
        ),
      ),
  );

  server.registerTool(
    'update_stats',
    {
      description:
        'stats ブロックの 1 項目を更新する。index と expectedLabel の両方で対象を確認する（不一致なら保存しない）。',
      inputSchema: {
        sheetId: sheetIdField,
        index: z.number().int().nonnegative().describe('stats.items の 0 始まりインデックス'),
        expectedLabel: z.string().describe('対象項目の現在の label（一致しない場合は更新しない）'),
        expectedUpdatedAt: expectedUpdatedAtField,
        fields: z
          .object({
            label: z.string().optional(),
            value: z.string().optional(),
            unit: z.string().optional(),
          })
          .describe('更新したいフィールドだけを指定する'),
      },
    },
    async ({ sheetId, index, expectedLabel, expectedUpdatedAt, fields }) =>
      runTool(async () =>
        serializeWriteResult(
          await updateStatsItem({
            sheetId,
            index,
            expectedLabel,
            expectedUpdatedAt: new Date(expectedUpdatedAt),
            fields,
          }),
        ),
      ),
  );

  server.registerTool(
    'add_project_item',
    {
      description: '案件を 1 件追加する。案件 ID はサーバー側で生成される（クライアント指定は受け付けない）。',
      inputSchema: {
        sheetId: sheetIdField,
        expectedUpdatedAt: expectedUpdatedAtField,
        item: z
          .object({
            companyId: z.string().optional().describe('既存の会社 ID。省略・空文字は「会社未登録」の案件になる'),
            title: z.string().describe('案件名'),
            scope: z.string().default(''),
            period: z.string().default(''),
            role: z.string().default(''),
            team: z.string().default(''),
            tech: z.object(techShape).partial().optional(),
            process: z.array(z.string()).default([]),
            duties: z.string().default(''),
            acquired: z.string().default(''),
            comment: z.string().default(''),
            summary: z.string().optional(),
            duration: z.string().optional(),
            hidden: z.boolean().optional(),
            periodStart: z.string().optional(),
            periodEnd: z.string().optional(),
            ongoing: z.boolean().optional(),
          })
          .describe('追加する案件（id は含めない）'),
      },
    },
    async ({ sheetId, expectedUpdatedAt, item }) =>
      runTool(async () =>
        serializeWriteResult(await addProjectItem({ sheetId, expectedUpdatedAt: new Date(expectedUpdatedAt), item })),
      ),
  );

  server.registerTool(
    'reorder_project_items',
    {
      description:
        '案件の表示順を projectIds の順に一括で並び替える。既存の全案件 ID を過不足なく含む必要がある（重複・欠落・未知 ID は拒否）。',
      inputSchema: {
        sheetId: sheetIdField,
        expectedUpdatedAt: expectedUpdatedAtField,
        projectIds: z.array(z.string()).describe('並び替え後の案件 ID の全リスト（既存 ID と完全一致必須）'),
      },
    },
    async ({ sheetId, expectedUpdatedAt, projectIds }) =>
      runTool(async () =>
        serializeWriteResult(
          await reorderProjectItems({ sheetId, expectedUpdatedAt: new Date(expectedUpdatedAt), projectIds }),
        ),
      ),
  );
}
