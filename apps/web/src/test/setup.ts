import * as React from 'react';
import '@testing-library/jest-dom';

import { cleanup } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterAll, afterEach, beforeAll, expect, vi } from 'vitest';

import './icon.mock';
import ResizeObserverMock from './mock/resize-observer.mock';

// MSWのセットアップ
beforeAll(() => {
  // MSWのサーバーをセットアップ
});

afterAll(() => {
  // MSWのサーバーをクリーンアップ
});

// テスト用のユーティリティ関数
export interface CustomMatchers<R = unknown> {
  toHaveBeenCalledOnceWith(...args: unknown[]): R;
}

expect.extend({
  toHaveBeenCalledOnceWith(received: ReturnType<typeof vi.fn>, ...expectedArgs: unknown[]) {
    const pass =
      received.mock.calls.length === 1 && JSON.stringify(received.mock.calls[0]) === JSON.stringify(expectedArgs);

    return {
      message: () => `expected ${received} to have been called once with ${expectedArgs}`,
      pass,
    };
  },
});

// テスト後のクリーンアップ
afterEach(() => {
  cleanup();
});

// Next.js のコンポーネントをモック
type ImageProps = ComponentProps<'img'> & {
  src: string;
  alt: string;
  width: number;
  height: number;
};

vi.mock('next/image', () => ({
  __esModule: true,
  default: function MockImage(props: ImageProps) {
    return {
      type: 'img',
      props: {
        ...props,
        'data-testid': 'mock-image',
      },
    };
  },
}));

type LinkProps = ComponentProps<'a'> & {
  href: string;
  children: React.ReactNode;
};

vi.mock('next/link', () => ({
  __esModule: true,
  default: function MockLink({ href, children, ...props }: LinkProps) {
    return React.createElement('a', { href, ...props }, children);
  },
}));

// jsdom localStorage polyfill (jsdom 27+ doesn't expose clear/key on some environments)
if (typeof localStorage === 'undefined' || typeof localStorage.clear !== 'function') {
  const storage: Record<string, string> = {};
  Object.defineProperty(global, 'localStorage', {
    value: {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => {
        storage[key] = value;
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
      clear: () => {
        Object.keys(storage).forEach((k) => {
          delete storage[k];
        });
      },
      get length() {
        return Object.keys(storage).length;
      },
      key: (index: number) => Object.keys(storage)[index] ?? null,
    },
    writable: true,
  });
}

if (typeof sessionStorage === 'undefined' || typeof sessionStorage.clear !== 'function') {
  const storage: Record<string, string> = {};
  Object.defineProperty(global, 'sessionStorage', {
    value: {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => {
        storage[key] = value;
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
      clear: () => {
        Object.keys(storage).forEach((k) => {
          delete storage[k];
        });
      },
      get length() {
        return Object.keys(storage).length;
      },
      key: (index: number) => Object.keys(storage)[index] ?? null,
    },
    writable: true,
  });
}

global.matchMedia = vi.fn().mockImplementation(
  (query): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
);

global.ResizeObserver = ResizeObserverMock;

// jsdom には IntersectionObserver が無いためモックする（use-active-heading が使用）
class IntersectionObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => []);
  root = null;
  rootMargin = '';
  thresholds = [];
}
global.IntersectionObserver = IntersectionObserverMock as unknown as typeof IntersectionObserver;

// Radix UI（Tooltip/Dialog 等）は pointer capture / scrollIntoView を使うが jsdom には無いためモックする
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = vi.fn();
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = vi.fn();
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
