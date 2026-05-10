import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import OdometerDial, { formatValue } from './OdometerDial';

describe('formatValue', () => {
  it('pads integers with leading zeros', () => {
    expect(formatValue(7, 3, 0)).toBe('007');
    expect(formatValue(123, 3, 0)).toBe('123');
  });

  it('handles decimals with rounding', () => {
    expect(formatValue(12.34, 3, 1)).toBe('012.3');
    expect(formatValue(12.36, 3, 1)).toBe('012.4');
    expect(formatValue(0.13, 1, 2)).toBe('0.13');
  });

  it('clamps to max representable rather than overflowing layout', () => {
    expect(formatValue(9999, 3, 0)).toBe('999');
    expect(formatValue(1234.5, 3, 1)).toBe('999.9');
  });

  it('clamps negatives to zero', () => {
    expect(formatValue(-5, 2, 0)).toBe('00');
  });
});

describe('OdometerDial', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders one digit cell per integer position', () => {
    const { container } = render(<OdometerDial value={123} digits={3} />);
    // Each OdometerDigit renders 11 cells (0..9 + duplicate 0). 3 digits → 33 cells.
    const cells = container.querySelectorAll('[class*="font-odometer"]');
    // Filter to just digit characters (decimal cell would also match font-odometer in real layout
    // but there's no decimal here).
    const digitCells = Array.from(cells).filter((el) => /^[0-9]$/.test(el.textContent ?? ''));
    expect(digitCells.length).toBe(33);
  });

  it('renders a decimal point cell when decimals > 0', () => {
    render(<OdometerDial value={12.3} digits={2} decimals={1} />);
    expect(screen.getByText('.')).toBeInTheDocument();
  });

  it('updates the rendered digit when value prop changes', () => {
    const { rerender, container } = render(
      <OdometerDial value={5} digits={1} decimals={0} />
    );
    expect(getReelTransform(container)).toMatch(/translateY/);
    const beforeY = extractY(getReelTransform(container)!);

    rerender(<OdometerDial value={7} digits={1} decimals={0} />);
    act(() => { vi.advanceTimersByTime(0); });
    const afterY = extractY(getReelTransform(container)!);

    // Reel translates further up (more negative) for a higher digit.
    expect(afterY).toBeLessThan(beforeY);
  });

  it('handles 9 → 0 wrap by snapping back after the animation window', () => {
    const { rerender, container } = render(
      <OdometerDial value={9} digits={1} decimals={0} />
    );
    const at9 = extractY(getReelTransform(container)!);

    rerender(<OdometerDial value={0} digits={1} decimals={0} />);
    // Mid-animation the reel should be heading toward the duplicate 0 at index 10
    // (which is below index 9, so a more negative translateY).
    act(() => { vi.advanceTimersByTime(0); });
    const midAnim = extractY(getReelTransform(container)!);
    expect(midAnim).toBeLessThan(at9);

    // After the snap-back timer fires, the reel resets to the index-0 position.
    act(() => { vi.advanceTimersByTime(310); });
    const afterSnap = extractY(getReelTransform(container)!);
    expect(afterSnap).toBeGreaterThan(midAnim);
  });

  it('applies a D-cap rounded right edge only on the last digit when hasDCap is true', () => {
    const { container } = render(
      <OdometerDial value={123} digits={3} hasDCap />
    );
    const reelWindows = container.querySelectorAll('div.relative.overflow-hidden.bg-black');
    expect(reelWindows.length).toBe(3);

    const lastStyle = (reelWindows[2] as HTMLElement).style;
    expect(lastStyle.borderTopRightRadius).toBe('50%');

    const firstStyle = (reelWindows[0] as HTMLElement).style;
    expect(firstStyle.borderTopRightRadius).toMatch(/^0(px)?$/);
  });

  it('does not apply a D-cap when hasDCap is false', () => {
    const { container } = render(
      <OdometerDial value={123} digits={3} />
    );
    const reelWindows = container.querySelectorAll('div.relative.overflow-hidden.bg-black');
    Array.from(reelWindows).forEach((w) => {
      expect((w as HTMLElement).style.borderTopRightRadius).toMatch(/^0(px)?$/);
    });
  });
});

// Helpers --------------------------------------------------------

function getReelTransform(container: HTMLElement): string | null {
  // The first reel's inner translating div is the second-level child of the first
  // ".relative.overflow-hidden.bg-black" window.
  const window = container.querySelector('div.relative.overflow-hidden.bg-black');
  const reel = window?.firstElementChild as HTMLElement | null;
  return reel?.style.transform ?? null;
}

function extractY(transform: string): number {
  const match = transform.match(/translateY\(([-\d.]+)px\)/);
  return match ? parseFloat(match[1]) : NaN;
}
