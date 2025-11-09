import { router, createContext } from '../trpc';

import { skillSheetRouter } from './skillSheet';
import { viewerAuthRouter } from './viewerAuth';

/**
 * Main application router
 */
export const appRouter = router({
  skillSheet: skillSheetRouter,
  viewerAuth: viewerAuthRouter,
});

export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for SSR
 */
export const createCaller = async () => {
  const ctx = await createContext();
  return appRouter.createCaller(ctx);
};
