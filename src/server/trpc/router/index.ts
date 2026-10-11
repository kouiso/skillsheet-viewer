import { router } from '../init';
import { authRouter } from './auth';
import { driveRouter } from './drive';
import { githubSheetRouter } from './github-sheet';
import { maintenanceRouter } from './maintenance';
import { sheetRouter } from './sheet';

export const appRouter = router({
  auth: authRouter,
  drive: driveRouter,
  sheet: sheetRouter,
  githubSheet: githubSheetRouter,
  maintenance: maintenanceRouter,
});

export type AppRouter = typeof appRouter;
