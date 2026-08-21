import type { StorybookConfig } from '@storybook/nextjs-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  // Storybook 9 で addon-essentials が本体へ統合された際、docs だけは別パッケージのまま残った。
  // 各 story の tags: ['autodocs'] はこれが無いとドキュメントページを生成しない。
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/nextjs-vite',
    options: {},
  },
};

export default config;
