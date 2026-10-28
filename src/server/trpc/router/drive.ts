import { getOwnerId } from '@/db';
import { clearDriveDestination, readDriveDestination, saveDriveDestination } from '@/db/drive-destination';

import { editorProcedure, router } from '../init';
import { driveDestinationInputSchema } from '../schema';

/**
 * Google Drive 保存の窓口（オーナー専用）。
 *
 * Google 連携の設定値 3 つ（OAuth クライアント ID・Picker API キー・
 * プロジェクト番号）はブラウザへ渡して初めて使える値なので、
 * NEXT_PUBLIC_ ではなくこの router 経由でオーナーにだけ返す。
 * 3 つとも任意の環境変数で、1 つでも欠ければ機能ごと隠す（enabled: false）。
 * 半設定をエラーにはしない — 未設定と半設定を画面側で区別する必要が
 * ないうえ、どちらも「この環境では使えない」で足りるため。
 */
function googleClientConfig() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const pickerApiKey = process.env.GOOGLE_PICKER_API_KEY;
  const appId = process.env.GOOGLE_CLOUD_PROJECT_NUMBER;
  if (!clientId || !pickerApiKey || !appId) return null;
  return { clientId, pickerApiKey, appId };
}

export const driveRouter = router({
  /**
   * 保存に必要な設定一式を返す。DB の失敗は握りつぶさずそのまま投げる
   * （権限の付け忘れ等を「未設定」と見間違えないため — #384 §8）。
   */
  setting: editorProcedure.query(async () => {
    const client = googleClientConfig();
    if (!client) return { enabled: false as const };
    const destination = await readDriveDestination(getOwnerId());
    return { enabled: true as const, client, destination };
  }),

  /** Picker で選んだフォルダを保存先として記録する。 */
  setDestination: editorProcedure.input(driveDestinationInputSchema).mutation(async ({ input }) => {
    await saveDriveDestination(getOwnerId(), { folderId: input.folderId, folderName: input.folderName });
    return { ok: true as const };
  }),

  /** 保存先を消す。次回の保存は再度フォルダ選択から始まる。 */
  clearDestination: editorProcedure.mutation(async () => {
    await clearDriveDestination(getOwnerId());
    return { ok: true as const };
  }),
});
