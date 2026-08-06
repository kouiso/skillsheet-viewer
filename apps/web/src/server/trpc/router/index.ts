import { router } from '../init';
import { githubSheetRouter } from './github-sheet';
import { sheetRouter } from './sheet';

export const appRouter = router({
  sheet: sheetRouter,
  githubSheet: githubSheetRouter,
});

export type AppRouter = typeof appRouter;
