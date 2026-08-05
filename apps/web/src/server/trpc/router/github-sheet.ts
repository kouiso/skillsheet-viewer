import { TRPCError } from '@trpc/server';

import { isSheetFileName, isValidSheetPath, SheetNotFoundError } from '@/server/github-sheets';
import { getCachedSheet, getCachedSheets } from '@/server/sheets-cache';

import { router, viewerProcedure } from '../init';
import { githubSheetPathInputSchema } from '../schema';

// DB が正本で、この router は GitHub 由来の legacy 経路（/view/[path]・/compare）専用。
export const githubSheetRouter = router({
  list: viewerProcedure.query(() => getCachedSheets()),

  // tRPC procedure は throw された値を無条件で TRPCError にラップするため、
  // SheetNotFoundError の instanceof チェックは呼び出し元に残せない。NOT_FOUND へ明示マップする
  // （sheet.byId と同じ理由。詳細はそちらのコメント参照）。
  //
  // path はここで isValidSheetPath / isSheetFileName を必ず通す。移行前は
  // app/view/[path]/page.tsx と app/compare/page.tsx が notFound() で弾いていたが、
  // このチェックはページ側にしか無く router には無かった。/api/trpc は URL 直叩きが
  // できるため、ページの導線を経由しない任意の path（.. トラバーサルや
  // CLAUDE.md/AGENTS.md 等の AI 指示系ファイル）でも GitHub API へそのまま渡ってしまう。
  // 存在しないファイルと同じ NOT_FOUND にして、検証で弾かれたかどうかを外部から
  // 区別できないようにする。
  byPath: viewerProcedure.input(githubSheetPathInputSchema).query(async ({ input }) => {
    if (!isValidSheetPath(input.path) || !isSheetFileName(input.path)) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'sheet not found' });
    }
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
