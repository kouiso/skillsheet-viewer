import { loadScriptOnce } from './load-script';

/**
 * Google Picker で保存先フォルダを選ぶ。
 * マイドライブと共有ドライブの両方を選べるよう、
 * setAppId（プロジェクト番号）と setDeveloperKey（API キー）を指定する
 * （共有ドライブの選択には OAuth クライアントと同じプロジェクトの app ID が必須）。
 */

const GAPI_URL = 'https://apis.google.com/js/api.js';

interface PickerDocument {
  id: string;
  name?: string;
}
interface PickerResponse {
  action?: string;
  docs?: PickerDocument[];
}
interface DocsView {
  setIncludeFolders: (include: boolean) => DocsView;
  setSelectFolderEnabled: (enabled: boolean) => DocsView;
}
interface Picker {
  setVisible: (visible: boolean) => void;
}
interface PickerBuilder {
  addView: (view: DocsView) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  setDeveloperKey: (key: string) => PickerBuilder;
  setAppId: (appId: string) => PickerBuilder;
  enableFeature: (feature: unknown) => PickerBuilder;
  setCallback: (callback: (data: PickerResponse) => void) => PickerBuilder;
  setTitle: (title: string) => PickerBuilder;
  build: () => Picker;
}
interface GooglePicker {
  picker: {
    DocsView: new () => DocsView;
    PickerBuilder: new () => PickerBuilder;
    Feature: { SUPPORT_DRIVES: unknown };
  };
}
interface Gapi {
  load: (apiName: string, callback: () => void) => void;
}

function gapi(): Gapi | undefined {
  return (globalThis as { gapi?: Gapi }).gapi;
}
function googlePicker(): GooglePicker | undefined {
  return (globalThis as { google?: GooglePicker }).google;
}

let pickerModulePromise: Promise<void> | null = null;

/** gapi を読み込み、picker モジュールを初期化する。 */
function ensurePickerModule(): Promise<void> {
  if (pickerModulePromise) return pickerModulePromise;
  pickerModulePromise = loadScriptOnce(GAPI_URL).then(
    () =>
      new Promise<void>((resolve, reject) => {
        const g = gapi();
        if (!g) {
          pickerModulePromise = null;
          reject(new Error('gapi の読み込みに失敗しました'));
          return;
        }
        g.load('picker', resolve);
      }),
  );
  return pickerModulePromise;
}

export interface PickedDriveFolder {
  id: string;
  name: string;
}

/**
 * フォルダ選択の Picker を開く。
 * 選ばれたらフォルダ情報、キャンセルされたら null を返す。
 * 必ずユーザーのクリックから同期的に呼ぶ（ポップアップではないが
 * 表示までに await を挟むため、呼び出し側ではトークンを先に確保する）。
 */
export async function pickDriveFolder(input: {
  apiKey: string;
  appId: string;
  accessToken: string;
}): Promise<PickedDriveFolder | null> {
  await ensurePickerModule();
  const picker = googlePicker();
  if (!picker) throw new Error('Picker の初期化に失敗しました');

  return new Promise<PickedDriveFolder | null>((resolve) => {
    const view = new picker.picker.DocsView().setIncludeFolders(true).setSelectFolderEnabled(true);
    const instance = new picker.picker.PickerBuilder()
      .addView(view)
      .enableFeature(picker.picker.Feature.SUPPORT_DRIVES)
      .setOAuthToken(input.accessToken)
      .setDeveloperKey(input.apiKey)
      .setAppId(input.appId)
      .setTitle('保存先のフォルダを選択')
      .setCallback((data) => {
        if (data.action === 'picked') {
          const doc = data.docs?.[0];
          resolve(doc ? { id: doc.id, name: doc.name ?? doc.id } : null);
        } else if (data.action === 'cancel') {
          resolve(null);
        }
      })
      .build();
    instance.setVisible(true);
  });
}
