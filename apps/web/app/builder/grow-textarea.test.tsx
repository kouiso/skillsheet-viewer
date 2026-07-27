import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GrowTextarea } from './grow-textarea';

let width = 400;
let scrollHeight = 100;
let callbacks: (() => void)[] = [];

const original = {
  clientWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
  scrollHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight'),
  observer: globalThis.ResizeObserver,
};

beforeEach(() => {
  width = 400;
  scrollHeight = 100;
  callbacks = [];
  // jsdom はレイアウトを持たないので、幅と内容高さを差し替えて幅変更を再現する
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => width });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => scrollHeight });
  globalThis.ResizeObserver = class {
    constructor(cb: () => void) {
      callbacks.push(cb);
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  if (original.clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', original.clientWidth);
  else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  if (original.scrollHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', original.scrollHeight);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  globalThis.ResizeObserver = original.observer;
});

const renderTa = () =>
  render(<GrowTextarea value="ある程度の長さの本文" onChange={vi.fn()} label="担当業務" />).container
    .firstElementChild as HTMLTextAreaElement;

describe('GrowTextarea の高さ追従', () => {
  it('初期表示で内容の高さに合わせる', () => {
    expect(renderTa().style.height).toBe('102px');
  });

  it('幅が変わったら同じ本文でも高さを合わせ直す', () => {
    const ta = renderTa();

    // 幅が狭くなると同じ本文でも行数が増える
    width = 200;
    scrollHeight = 300;
    act(() => {
      for (const cb of callbacks) cb();
    });

    expect(ta.style.height).toBe('302px');
  });

  it('幅が変わっていなければ測り直さない（観測が止まらなくなるのを防ぐ）', () => {
    const ta = renderTa();

    // 高さだけ変わった通知（fit 自身が高さを書き換えた結果として届く）
    scrollHeight = 300;
    act(() => {
      for (const cb of callbacks) cb();
    });

    expect(ta.style.height).toBe('102px');
  });

  it('上限を超えたら内部スクロールへ切り替える', () => {
    const ta = renderTa();

    width = 200;
    scrollHeight = 900;
    act(() => {
      for (const cb of callbacks) cb();
    });

    expect(ta.style.height).toBe('520px');
    expect(ta.style.overflowY).toBe('auto');
  });
});
