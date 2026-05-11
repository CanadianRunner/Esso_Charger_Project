import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { usePreviewMode } from './usePreviewMode';

describe('usePreviewMode', () => {
  beforeEach(() => {
    // jsdom defaults to about:blank — set a known URL each test.
    window.history.replaceState({}, '', '/');
  });

  it('returns false when ?preview is absent', () => {
    const { result } = renderHook(() => usePreviewMode());
    expect(result.current).toBe(false);
  });

  it('returns true when ?preview=true is present', () => {
    window.history.replaceState({}, '', '/?preview=true');
    const { result } = renderHook(() => usePreviewMode());
    expect(result.current).toBe(true);
  });

  it('returns false for any other value', () => {
    window.history.replaceState({}, '', '/?preview=1');
    const { result } = renderHook(() => usePreviewMode());
    expect(result.current).toBe(false);
  });
});
