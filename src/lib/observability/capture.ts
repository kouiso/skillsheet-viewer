import type { ObservabilityEvent } from './event';

/**
 * アプリコードから直接 `@sentry/*` / `posthog-js` を呼ばせないための唯一の窓口。
 * `scripts/check-telemetry-imports.mjs` がこのファイル以外からの直接 import を lint で禁止する。
 *
 * SDK ハンドルはモジュールスコープの変数ではなく `globalThis` に置く。Next はクライアント
 * バンドルを複数レイヤ（RSC / route handler / client）に分けて処理するため、モジュール
 * スコープの変数はレイヤをまたいで共有される保証がない。`instrumentation-client.ts` が
 * Sentry / PostHog を初期化した直後に `registerObservabilityHandle()` でここへ登録する。
 *
 * 未登録なら黙って no-op（throw しない）。`useThemeMode()` のような「無いと壊れる」機能とは
 * 違い、計測が届かないことはアプリの不具合ではない。
 */

export interface CaptureContext {
  /** どの境界/処理から呼ばれたか（例: 'route-error-boundary', 'config-error-boundary'）。 */
  scope?: string;
  /** 機能単位のタグ（例: 'pdf-export'）。 */
  feature?: string;
  /** 同じ原因のエラーをダッシュボード上で1つにまとめるための固定キー。 */
  fingerprint?: string[];
}

export interface ObservabilityHandle {
  capture(error: unknown, level: 'error' | 'warning', context: CaptureContext): void;
  track(event: ObservabilityEvent): void;
}

const REGISTRY_KEY = Symbol.for('skillsheet.observability');

type GlobalWithRegistry = typeof globalThis & { [REGISTRY_KEY]?: ObservabilityHandle };

export function registerObservabilityHandle(handle: ObservabilityHandle): void {
  (globalThis as GlobalWithRegistry)[REGISTRY_KEY] = handle;
}

function getHandle(): ObservabilityHandle | undefined {
  return (globalThis as GlobalWithRegistry)[REGISTRY_KEY];
}

export function captureError(error: unknown, context: CaptureContext = {}): void {
  getHandle()?.capture(error, 'error', context);
}

export function captureWarning(error: unknown, context: CaptureContext = {}): void {
  getHandle()?.capture(error, 'warning', context);
}

export function track(event: ObservabilityEvent): void {
  getHandle()?.track(event);
}
