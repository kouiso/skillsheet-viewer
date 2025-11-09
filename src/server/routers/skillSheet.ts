import { z } from 'zod';

import { router, publicProcedure, protectedProcedure } from '../trpc';

const skillSheetSchema = z.object({
  title: z.string().min(1, '  タイトルを入力してください'),
  content: z.string().min(1, 'コンテンツを入力してください'),
});

export const skillSheetRouter = router({
  /**
   * Get skill sheet (public)
   */
  get: publicProcedure.query(async ({ ctx }) => {
    const skillSheet = await ctx.prisma.skillSheet.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (!skillSheet) {
      return null;
    }

    return {
      id: skillSheet.id,
      title: skillSheet.title,
      content: skillSheet.content,
      createdAt: skillSheet.createdAt,
      updatedAt: skillSheet.updatedAt,
    };
  }),

  /**
   * Save skill sheet (admin only)
   */
  save: protectedProcedure.input(skillSheetSchema).mutation(async ({ ctx, input }) => {
    // Delete all existing skill sheets
    await ctx.prisma.skillSheet.deleteMany();

    // Create new skill sheet
    const skillSheet = await ctx.prisma.skillSheet.create({
      data: {
        title: input.title,
        content: input.content,
      },
    });

    return {
      skillSheet: {
        id: skillSheet.id,
        title: skillSheet.title,
        content: skillSheet.content,
        createdAt: skillSheet.createdAt,
        updatedAt: skillSheet.updatedAt,
      },
    };
  }),
});
