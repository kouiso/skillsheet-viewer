import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { router, publicProcedure, protectedProcedure } from '../trpc';

const verifySchema = z.object({
  code: z.string().min(1, '認証コードを入力してください'),
});

const updateCodeSchema = z.object({
  code: z.string().min(6, '認証コードは6文字以上で入力してください'),
});

export const viewerAuthRouter = router({
  /**
   * Verify viewer authentication code
   */
  verify: publicProcedure.input(verifySchema).mutation(async ({ ctx, input }) => {
    const viewerAuths = await ctx.prisma.viewerAuth.findMany();

    for (const auth of viewerAuths) {
      const isValid = await bcrypt.compare(input.code, auth.code);
      if (isValid) {
        return { success: true };
      }
    }

    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: '認証コードが正しくありません',
    });
  }),

  /**
   * Update viewer authentication code (admin only)
   */
  updateCode: protectedProcedure.input(updateCodeSchema).mutation(async ({ ctx, input }) => {
    const hashedCode = await bcrypt.hash(input.code, 10);

    // Delete all existing codes
    await ctx.prisma.viewerAuth.deleteMany();

    // Create new code
    const viewerAuth = await ctx.prisma.viewerAuth.create({
      data: { code: hashedCode },
    });

    return {
      message: '認証コードを更新しました',
      id: viewerAuth.id,
    };
  }),
});
