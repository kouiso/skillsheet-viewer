import { z } from 'zod';
import { isRevision } from '../document-contract';

const id = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .transform((s) => s.toLowerCase());
const revision = z.string().refine(isRevision);
const block = z.strictObject({ id, type: z.string(), order: z.number().int().nonnegative(), data: z.unknown() });
const content = { sheetId: id, title: z.string(), blocks: z.array(block) };

/** 未知の操作・SQL・owner・余分な引数は境界で拒否する。 */
export const documentOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('read'), sheetId: id.nullable() }),
  z.strictObject({ operation: z.literal('list') }),
  z.strictObject({ operation: z.literal('create'), ...content }),
  z.strictObject({ operation: z.literal('replace'), ...content, expectedRevision: revision }),
  z.strictObject({ operation: z.literal('delete'), sheetId: id, expectedRevision: revision }),
  z.strictObject({
    operation: z.literal('history.list'),
    sheetId: id,
    before: revision.nullable(),
    limit: z.number().int().min(1).max(20),
  }),
  z.strictObject({ operation: z.literal('history.read'), sheetId: id, revision }),
  z.strictObject({ operation: z.literal('history.countAfter'), sheetId: id, target: revision, current: revision }),
  z.strictObject({
    operation: z.literal('history.restore'),
    sheetId: id,
    target: revision,
    expectedRevision: revision,
    confirmation: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  }),
  z.strictObject({ operation: z.literal('history.deletedList') }),
  z.strictObject({
    operation: z.literal('history.restoreDeleted'),
    sheetId: id,
    expectedRevision: revision,
    confirmation: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  }),
]);

export const auxiliaryOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('drive.read') }),
  z.strictObject({
    operation: z.literal('drive.save'),
    folderId: z.string().min(1).max(256),
    folderName: z.string().min(1).max(512),
  }),
  z.strictObject({ operation: z.literal('drive.clear') }),
  z.strictObject({ operation: z.literal('viewer.reserve'), key: z.string().regex(/^(unknown|ip:[a-f0-9]{32})$/) }),
  z.strictObject({ operation: z.literal('viewer.check'), key: z.string().regex(/^(unknown|ip:[a-f0-9]{32})$/) }),
  z.strictObject({ operation: z.literal('viewer.clear'), key: z.string().regex(/^(unknown|ip:[a-f0-9]{32})$/) }),
  z.strictObject({ operation: z.literal('viewer.purge') }),
]);

export const gatewayOperationSchema = z.union([documentOperationSchema, auxiliaryOperationSchema]);
export type GatewayOperation = z.infer<typeof gatewayOperationSchema>;
export type AuxiliaryOperation = z.infer<typeof auxiliaryOperationSchema>;
