import { renderHook } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePreviewMode } from './usePreviewMode';
import { isProductionBuild } from '../lib/environment';

vi.mock('../lib/environment', () => ({
  isProductionBuild: vi.fn(() => false),
}));

describe('usePreviewMode', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    vi.mocked(isProductionBuild).mockReturnValue(false);
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

  it('returns false in production builds even when ?preview=true is present', () => {
    vi.mocked(isProductionBuild).mockReturnValue(true);
    window.history.replaceState({}, '', '/?preview=true');
    const { result } = renderHook(() => usePreviewMode());
    expect(result.current).toBe(false);
  });
});
