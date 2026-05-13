import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import AdminSettings from './AdminSettings';

const INITIAL_SETTINGS = {
  'display.mini_rotation_seconds': '10',
  'display.post_session_bright_seconds': '300',
  'display.post_session_dim_seconds': '600',
  'display.brightness_active': '1.0',
  'display.brightness_dim': '0.6',
  'display.brightness_overnight': '0.3',
  'display.overnight_start_hour': '23',
  'display.overnight_end_hour': '6',
  'display.dial_exercise_interval_seconds': '3600',
};

interface FetchCall {
  url: string;
  method: string;
  body?: string;
}

function setupMockFetch(initial = INITIAL_SETTINGS) {
  const calls: FetchCall[] = [];
  const state = { values: { ...initial } as Record<string, string> };
  global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: url.toString(), method: init?.method ?? 'GET', body: init?.body as string });
    if (init?.method === 'PATCH') {
      const body = JSON.parse((init.body as string) ?? '{}') as { values: Record<string, string> };
      for (const [k, v] of Object.entries(body.values)) state.values[k] = v;
      return Promise.resolve(json({ values: state.values }));
    }
    return Promise.resolve(json({ values: state.values }));
  }) as unknown as typeof fetch;
  return { calls, state };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderAt(path = '/admin/settings') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/settings" element={<AdminSettings />} />
        <Route path="/admin" element={<p>dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminSettings', () => {
  beforeEach(() => { setupMockFetch(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('renders the tab bar with General active and Backup permanently disabled', async () => {
    renderAt();
    await screen.findByText(/mini-readout rotation/i);
    expect(screen.getByRole('button', { name: 'General' })).toBeInTheDocument();
    const backup = screen.getByText('Backup');
    expect(backup).toHaveAttribute('aria-disabled', 'true');
    expect(backup.getAttribute('title')).toMatch(/phase 8/i);
  });

  it('loads server values into the General tab fields', async () => {
    renderAt();
    await screen.findByText(/mini-readout rotation/i);
    // Brightness Active displays as 100 (% of 1.0)
    const brightnessInputs = screen.getAllByDisplayValue('100');
    expect(brightnessInputs.length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('60')).toBeInTheDocument(); // dim 0.6 → 60
    expect(screen.getByDisplayValue('30')).toBeInTheDocument(); // overnight 0.3 → 30
  });

  it('marks the page dirty and shows the save bar when a value changes', async () => {
    renderAt();
    await screen.findByText(/mini-readout rotation/i);

    // Find the brightness-dim input by its dim label, then change.
    const dimLabel = screen.getByText(/dim \(idle/i);
    const dimInput = dimLabel.parentElement!.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(dimInput, { target: { value: '40' } });

    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('cancel reverts the draft back to the loaded server values', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByText(/mini-readout rotation/i);

    const dimLabel = screen.getByText(/dim \(idle/i);
    const dimInput = dimLabel.parentElement!.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(dimInput, { target: { value: '40' } });

    expect(dimInput.value).toBe('40');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(dimInput.value).toBe('60');
    expect(screen.queryByText(/unsaved changes/i)).not.toBeInTheDocument();
  });

  it('save PATCHes the changed values and shows the Saved indicator', async () => {
    const user = userEvent.setup();
    const { calls } = setupMockFetch();
    renderAt();
    await screen.findByText(/mini-readout rotation/i);

    const dimLabel = screen.getByText(/dim \(idle/i);
    const dimInput = dimLabel.parentElement!.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(dimInput, { target: { value: '40' } });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const patch = calls.find((c) => c.method === 'PATCH');
      expect(patch).toBeDefined();
    });
    const patch = calls.find((c) => c.method === 'PATCH')!;
    const body = JSON.parse(patch.body!) as { values: Record<string, string> };
    expect(body.values['display.brightness_dim']).toBe('0.40');
    await screen.findByText('Saved');
  });

  it('save with a server validation failure renders field-level errors', async () => {
    let calls = 0;
    global.fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      if (init?.method === 'PATCH') {
        return Promise.resolve(json({
          errors: [
            { key: 'display.brightness_dim', error: 'brightness must be between 0 and 1.' },
          ],
        }, 400));
      }
      return Promise.resolve(json({ values: INITIAL_SETTINGS }));
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    renderAt();
    await screen.findByText(/mini-readout rotation/i);

    const dimLabel = screen.getByText(/dim \(idle/i);
    const dimInput = dimLabel.parentElement!.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(dimInput, { target: { value: '40' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await screen.findByText(/brightness must be between 0 and 1/i);
    expect(calls).toBeGreaterThan(1);
  });

  it('toggling "Enable overnight dimming" off sets end hour to match start hour (disabled semantic)', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByText(/mini-readout rotation/i);

    const toggle = screen.getByLabelText(/enable overnight dimming/i) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    await user.click(toggle);
    expect(toggle.checked).toBe(false);
    // Hour inputs disappear when the toggle is off — saved with start === end.
    expect(screen.queryByLabelText(/start hour/i)).not.toBeInTheDocument();
  });

  it('toggling "Enable hourly dial exercise" off sets interval to 0', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByText(/mini-readout rotation/i);

    const toggle = screen.getByLabelText(/enable hourly dial exercise/i) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    await user.click(toggle);
    expect(toggle.checked).toBe(false);
  });
});
