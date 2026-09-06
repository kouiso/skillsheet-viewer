import { createHash, timingSafeEqual } from 'node:crypto';

import { TRPCError } from '@trpc/server';
import { revalidateTag } from 'next/cache';

import { REVALIDATE_SECRET_MISSING_MESSAGE } from '@/server/known-config-error';

import { publicProcedure, router } from '../init';

function safeEqual(a: string, b: string): boolean {
  const aHash = createHash('sha256').update(a, 'utf-8').digest();
  const bHash = createHash('sha256').update(b, 'utf-8').digest();
  return timingSafeEqual(aHash, bHash);
}

function getProvidedSecret(request: Request | null): string {
  if (!request) return '';
  return (
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    new URL(request.url).searchParams.get('secret') ??
    ''
  );
}

export const maintenanceRouter = router({
  revalidate: publicProcedure.mutation(({ ctx }) => {
    const secret = process.env.REVALIDATE_SECRET;
    if (!secret) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: REVALIDATE_SECRET_MISSING_MESSAGE });
    }

    const provided = getProvidedSecret(ctx.request);
    if (!provided || !safeEqual(provided, secret)) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'invalid revalidation secret' });
    }

    revalidateTag('sheets', { expire: 0 });
    revalidateTag('db-sheet', { expire: 0 });
    return { ok: true as const, revalidated: ['sheets', 'db-sheet'] as const };
  }),
});
