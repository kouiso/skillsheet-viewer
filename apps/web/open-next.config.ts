import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// キャッシュ層（R2 incremental cache / D1 tag cache）はリソース作成後に配線する。
// 現時点はサイズ計測とランタイム互換の確認のみが目的なので既定構成で通す。
export default defineCloudflareConfig();
