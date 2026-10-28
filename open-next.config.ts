import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// D1の正本readはrequestごと。追加R2契約・自動provisioningなしでUIをbundleする。
export default {
  ...defineCloudflareConfig(),
  buildCommand: 'corepack pnpm@10.33.0 exec next build',
};
