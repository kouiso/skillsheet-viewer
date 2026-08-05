import { TRPCError } from '@trpc/server';

import { SheetNotFoundError } from '@/server/github-sheets';
import { getCachedSheet, getCachedSheets } from '@/server/sheets-cache';

import { router, viewerProcedure } from '../init';
import { githubSheetPathInputSchema } from '../schema';

// DB が正本で、この router は GitHub 由来の legacy 経路（/view/[path]・/compare）専用。
export const githubSheetRouter = router({
  list: viewerProcedure.query(() => getCachedSheets()),

  // tRPC procedure は throw された値を無条件で TRPCError にラップするため、
  // SheetNotFoundError の instanceof チェックは呼び出し元に残せない。NOT_FOUND へ明示マップする
  // （sheet.byId と同じ理由。詳細はそちらのコメント参照）。
  byPath: viewerProcedure.input(githubSheetPathInputSchema).query(async ({ input }) => {
    try {
      return await getCachedSheet(input.path);
    } catch (err) {
      if (err instanceof SheetNotFoundError) {
        throw new TRPCError({ code: 'NOT_FOUND', message: err.message, cause: err });
      }
      throw err;
    }
  }),
});
