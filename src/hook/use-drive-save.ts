'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ExportEdition } from '@/lib/export/edition';
import { driveFailureMessage, formatDriveFileName, isDriveAuthExpired, uploadDriveFile } from '@/lib/google/drive-file';
import { pickDriveFolder } from '@/lib/google/drive-picker';
import { createDriveTokenSource, DriveAuthCancelledError, type DriveTokenSource } from '@/lib/google/drive-token';
import { loadScriptOnce } from '@/lib/google/load-script';
import { captureError } from '@/lib/observability/capture';
import { trpc } from '@/lib/trpc-client';

/**
 * Google Drive 保存の流れをまとめる hook（オーナー専用）。
 *
 * - 閲覧者には機能を出さない（canEdit=false のとき tRPC・Google スクリプトとも動かない）。
 * - 保存先フォルダは drive.setting が返す DB の記録。未設定なら「保存先を選ぶ」だけを出す。
 * - 保存の直列は「トークン要求 →（並行）ファイル生成 → アップロード」。
 *   トークン要求はクリックと同期的に開始し、ファイル生成を待たない。
 */

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

export type DriveSaveKind = 'pdf' | 'xlsx';

export interface DriveSaveFile {
  blob: Blob;
  /** 保存名の元になるタイトル（要約版は digestTitle 済み）。拡張子・日時はこちらで付ける。 */
  title: string;
}

export interface DriveSaveController {
  /** この環境・ユーザーで Drive 保存が使えるか。false なら UI ごと隠す。 */
  available: boolean;
  /** setting 問い合わせ中。準備表示の材料にする。 */
  loading: boolean;
  /** Google スクリプトが未読み込み。ボタンを「準備中」にする。 */
  preparing: boolean;
  /** setting の取得失敗。理由付きでボタンを押せなくする（黙って消さない）。 */
  settingError: string | null;
  destination: { folderId: string; folderName: string } | null;
  picking: boolean;
  saving: boolean;
  pickFolder: () => Promise<void>;
  save: (kind: DriveSaveKind, edition: ExportEdition) => Promise<void>;
}

interface UseDriveSaveOptions {
  canEdit: boolean;
  buildFile: (kind: DriveSaveKind, edition: ExportEdition) => Promise<DriveSaveFile>;
  /** テストで差し替える依存。実装は本物の GIS / Picker / Drive API。 */
  tokenSource?: DriveTokenSource;
  pickFolder?: (input: {
    apiKey: string;
    appId: string;
    accessToken: string;
  }) => Promise<{ id: string; name: string } | null>;
  upload?: typeof uploadDriveFile;
  now?: () => Date;
}

const KIND_EXT: Record<DriveSaveKind, string> = { pdf: 'pdf', xlsx: 'xlsx' };
const KIND_MIME: Record<DriveSaveKind, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const KIND_LABEL: Record<DriveSaveKind, string> = { pdf: 'PDF', xlsx: 'Excel' };

export function useDriveSave({
  canEdit,
  buildFile,
  tokenSource: injectedTokenSource,
  pickFolder: injectedPickFolder,
  upload: injectedUpload,
  now = () => new Date(),
}: UseDriveSaveOptions): DriveSaveController {
  const utils = trpc.useUtils();
  const setting = trpc.drive.setting.useQuery(undefined, { enabled: canEdit, retry: false });
  const setDestination = trpc.drive.setDestination.useMutation();
  const [preparing, setPreparing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const enabled = canEdit && setting.data?.enabled === true;
  // setting の取得失敗は機能ごと隠さない（環境変数未設定の enabled:false とは別物）。
  // DB 権限不足等をオーナーに黙って隠すと障害に気づけないため、エラー表示のために
  // メニュー自体は残す（issue §5「DBエラーは握りつぶさない」）。
  const available = enabled || setting.isError;
  const client = setting.data?.enabled === true ? setting.data.client : null;
  const destination = setting.data?.enabled === true ? (setting.data.destination ?? null) : null;

  // トークン源は clientId ごとに 1 つ。invalidate/再利用を保つため ref で持つ。
  const tokenSourceRef = useRef<DriveTokenSource | null>(null);
  const clientIdRef = useRef<string | null>(null);
  if (client && clientIdRef.current !== client.clientId) {
    clientIdRef.current = client.clientId;
    tokenSourceRef.current = injectedTokenSource ?? createDriveTokenSource(client.clientId);
  }

  // クリック時にポップアップブロッカーへ引っかからないよう、
  // 画面を開いた時点で Google のスクリプトを読み込んでおく。
  useEffect(() => {
    if (!enabled || injectedTokenSource) return;
    setPreparing(true);
    loadScriptOnce(GIS_SCRIPT_URL)
      .catch((err) => {
        console.error('Drive 保存の準備に失敗しました', err);
        captureError(err, { feature: 'drive-save' });
      })
      .finally(() => setPreparing(false));
  }, [enabled, injectedTokenSource]);

  const ensureToken = useCallback(async (): Promise<string> => {
    const source = tokenSourceRef.current;
    if (!source || !client) throw new Error('Drive 保存の設定がまだ読み込まれていません');
    return source.ensureToken();
  }, [client]);

  const pickFolder = useCallback(async () => {
    if (!client) return;
    const pick = injectedPickFolder ?? pickDriveFolder;
    const toastId = toast.loading('保存先を選択中…');
    try {
      setPicking(true);
      const accessToken = await ensureToken();
      const folder = await pick({ apiKey: client.pickerApiKey, appId: client.appId, accessToken });
      if (!folder) {
        toast.dismiss(toastId);
        return;
      }
      await setDestination.mutateAsync({ folderId: folder.id, folderName: folder.name });
      await utils.drive.setting.invalidate();
      toast.success(`保存先を「${folder.name}」に設定しました`, { id: toastId });
    } catch (err) {
      if (!(err instanceof DriveAuthCancelledError)) {
        console.error('保存先の選択に失敗しました', err);
        captureError(err, { feature: 'drive-save' });
      }
      toast.error(
        err instanceof DriveAuthCancelledError ? '保存先の選択を中止しました' : '保存先の設定に失敗しました',
        {
          id: toastId,
        },
      );
    } finally {
      setPicking(false);
    }
  }, [client, ensureToken, injectedPickFolder, setDestination, utils]);

  const save = useCallback(
    async (kind: DriveSaveKind, edition: ExportEdition) => {
      if (!client || !destination) return;
      const upload = injectedUpload ?? uploadDriveFile;
      const label = edition === 'digest' ? `要約版${KIND_LABEL[kind]}` : KIND_LABEL[kind];
      const toastId = toast.loading(`${label}を Drive に保存中…`);
      try {
        setSaving(true);
        // (1) トークン要求はクリックと同期的に開始し、ファイル生成を待たない。
        //     小窓が要る場合に生成完了を待つとユーザー不在のまま中途半端になる。
        const tokenPromise = ensureToken();
        // (2) ファイル生成は (1) と並行（既存のダウンロードと同じ作り方）。
        const filePromise = buildFile(kind, edition);
        const [accessToken, file] = await Promise.all([tokenPromise, filePromise]);
        // (3) ブラウザから Drive API へ直接アップロード。
        const name = formatDriveFileName(file.title, KIND_EXT[kind], now());
        const uploaded = await upload({
          accessToken,
          folderId: destination.folderId,
          name,
          blob: file.blob,
          mimeType: KIND_MIME[kind],
        });
        toast.success(`${label}を Drive に保存しました`, {
          id: toastId,
          action: uploaded.webViewLink
            ? { label: '開く', onClick: () => window.open(uploaded.webViewLink ?? '', '_blank', 'noopener') }
            : undefined,
        });
      } catch (err) {
        if (isDriveAuthExpired(err)) {
          // 401: 手元のトークンを捨て、次回の押下で取り直す。
          tokenSourceRef.current?.invalidate();
        }
        if (!(err instanceof DriveAuthCancelledError)) {
          console.error('Drive への保存に失敗しました', err);
          captureError(err, { feature: 'drive-save' });
        }
        toast.error(driveFailureMessage(err), { id: toastId });
      } finally {
        setSaving(false);
      }
    },
    [client, destination, buildFile, ensureToken, injectedUpload, now],
  );

  return useMemo(
    () => ({
      available,
      loading: canEdit && setting.isPending,
      preparing,
      settingError: setting.isError ? 'Drive 保存の設定を読み込めませんでした' : null,
      destination,
      picking,
      saving,
      pickFolder,
      save,
    }),
    [available, canEdit, setting.isPending, setting.isError, preparing, destination, picking, saving, pickFolder, save],
  );
}
