import '@testing-library/jest-dom/vitest';

// JSDOM does not implement ResizeObserver. Provide a no-op stub so component
// code can construct one without throwing; tests that care about resize
// behavior should mock or drive the observer directly.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
