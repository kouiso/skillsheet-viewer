import { router } from '../init';
import { authRouter } from './auth';
import { githubSheetRouter } from './github-sheet';
import { maintenanceRouter } from './maintenance';
import { sheetRouter } from './sheet';

export const appRouter = router({
  auth: authRouter,
  sheet: sheetRouter,
  githubSheet: githubSheetRouter,
  maintenance: maintenanceRouter,
});

export type AppRouter = typeof appRouter;
