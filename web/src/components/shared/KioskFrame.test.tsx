import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import KioskFrame from './KioskFrame';
import { isProductionBuild } from '../../lib/environment';

vi.mock('../../lib/environment', () => ({
  isProductionBuild: vi.fn(() => false),
}));

describe('KioskFrame', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
    vi.mocked(isProductionBuild).mockReturnValue(false);
  });

  it('renders children directly when ?scale=kiosk is absent', () => {
    render(
      <KioskFrame>
        <div data-testid="kiosk-content">hello</div>
      </KioskFrame>
    );
    expect(screen.getByTestId('kiosk-content')).toBeInTheDocument();
    // No surrounding scale wrapper.
    expect(document.querySelector('.fixed.inset-0')).not.toBeInTheDocument();
  });

  it('wraps in a scaled container when ?scale=kiosk is present', () => {
    window.history.replaceState({}, '', '/?scale=kiosk');
    render(
      <KioskFrame>
        <div data-testid="kiosk-content">hello</div>
      </KioskFrame>
    );
    expect(document.querySelector('.fixed.inset-0')).toBeInTheDocument();
    expect(screen.getByTestId('kiosk-content')).toBeInTheDocument();
  });

  it('ignores ?scale=kiosk in production builds (passthrough)', () => {
    vi.mocked(isProductionBuild).mockReturnValue(true);
    window.history.replaceState({}, '', '/?scale=kiosk');
    render(
      <KioskFrame>
        <div data-testid="kiosk-content">hello</div>
      </KioskFrame>
    );
    // Children render directly with no kiosk wrapper.
    expect(document.querySelector('.fixed.inset-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('kiosk-content')).toBeInTheDocument();
  });
});
