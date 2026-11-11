// Next.jsの既存入口。Workerはserviceを注入してtool-coreを直接利用する。
import 'server-only';
import type { McpServer } from '@modelcontextprotocol/server';
import * as sheetService from '../sheet-service';
import type { SheetService } from '../sheet-service-core';
import { registerSkillsheetTools as registerTools } from './tool-core';

export { type McpToolName, READ_TOOLS, WRITE_TOOLS } from './tool-core';

export function registerSkillsheetTools(server: McpServer, service: SheetService = sheetService): void {
  registerTools(server, service);
}
