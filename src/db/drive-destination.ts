import { eq } from 'drizzle-orm';
import { d1OwnerAuxiliary, isD1Runtime } from '@/server/d1-runtime';

import { type Database, getDb } from './client';
import { driveDestination } from './schema';

/**
 * Google Drive 保存先フォルダの読み書き。
 * 境界（skillsheet_private の SECURITY DEFINER 関数）の対象外なので、
 * viewer_login_attempt と同じく Drizzle から直接読み書きする。
 * runtime role への権限付与は install-runtime-role.sql と
 * doc/05-toc-and-deploy.md の単独 GRANT 文で行う。
 */

export interface DriveDestination {
  folderId: string;
  /** 選択時点のフォルダ名（表示用。Drive 側の改名には追従しない）。 */
  folderName: string;
}

/** 保存先を 1 件読む。未設定なら null。 */
export async function readDriveDestination(ownerId: string, db?: Database): Promise<DriveDestination | null> {
  if (!db && isD1Runtime())
    return (await d1OwnerAuxiliary(ownerId, { operation: 'drive.read' })) as DriveDestination | null;
  db ??= getDb();
  const [row] = await db
    .select({
      folderId: driveDestination.folderId,
      folderName: driveDestination.folderNameAtSelection,
    })
    .from(driveDestination)
    .where(eq(driveDestination.ownerId, ownerId))
    .limit(1);
  return row ?? null;
}

/** 保存先を記録する。オーナーごと 1 行なので既存行は上書きする。 */
export async function saveDriveDestination(
  ownerId: string,
  destination: DriveDestination,
  db?: Database,
): Promise<void> {
  if (!db && isD1Runtime()) {
    await d1OwnerAuxiliary(ownerId, { operation: 'drive.save', ...destination });
    return;
  }
  db ??= getDb();
  const now = new Date();
  await db
    .insert(driveDestination)
    .values({
      ownerId,
      folderId: destination.folderId,
      folderNameAtSelection: destination.folderName,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: driveDestination.ownerId,
      set: {
        folderId: destination.folderId,
        folderNameAtSelection: destination.folderName,
        updatedAt: now,
      },
    });
}

/** 保存先を消す（選び直しの前の状態へ戻す）。 */
export async function clearDriveDestination(ownerId: string, db?: Database): Promise<void> {
  if (!db && isD1Runtime()) {
    await d1OwnerAuxiliary(ownerId, { operation: 'drive.clear' });
    return;
  }
  db ??= getDb();
  await db.delete(driveDestination).where(eq(driveDestination.ownerId, ownerId));
}
