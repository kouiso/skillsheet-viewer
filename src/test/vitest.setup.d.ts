interface MediaQueryList {
  matches: boolean;
  media: string;
  onchange: null | (() => void);
  addListener: (listener: () => void) => void;
  removeListener: (listener: () => void) => void;
  addEventListener: (event: string, listener: () => void) => void;
  removeEventListener: (event: string, listener: () => void) => void;
  dispatchEvent: (event: Event) => boolean;
}

declare global {
  function matchMedia(query: string): MediaQueryList;

  class ResizeObserver {
    constructor(callback: ResizeObserverCallback);
    observe(target: Element): void;
    unobserve(target: Element): void;
    disconnect(): void;
  }
}

export {};
