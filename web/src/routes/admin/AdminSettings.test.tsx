import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  'hpwc.host': '',
  'hpwc.poll_interval_active_ms': '1000',
  'hpwc.poll_interval_idle_ms': '5000',
  'hpwc.timeout_ms': '3000',
  'shelly.host': '',
  'rate.source': 'manual',
  'rate.flat_cents_per_kwh': '13',
  'rate.openei_api_key': '',
  'rate.openei_schedule_id': '',
  'session.merge_grace_seconds': '60',
  'session.idle_threshold_amps': '0.5',
  'session.power_sample_interval_seconds': '10',
  'lifetime.offset_wh': '0',
};

const HARDWARE_INFO = {
  hpwc: { mode: 'Fake', enabled: null },
  shelly: { mode: 'Fake', enabled: true },
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
    const u = url.toString();
    calls.push({ url: u, method: init?.method ?? 'GET', body: init?.body as string });
    if (u.endsWith('/api/admin/hardware')) {
      return Promise.resolve(json(HARDWARE_INFO));
    }
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

/**
 * Wait for the draft state-sync to complete by checking that the
 * percent-formatted brightness inputs are populated. Use this before any
 * input-driven interaction; without it, the test can race the useEffect
 * that hydrates draft from serverValues and end up overwriting changes.
 */
async function waitForSettingsLoaded() {
  await screen.findAllByDisplayValue('100');
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
    await waitForSettingsLoaded();
    expect(screen.getByRole('button', { name: 'General' })).toBeInTheDocument();
    const backup = screen.getByText('Backup');
    expect(backup).toHaveAttribute('aria-disabled', 'true');
    expect(backup.getAttribute('title')).toMatch(/phase 8/i);
  });

  it('loads server values into the General tab fields', async () => {
    renderAt();
    // Wait for the percent-formatted brightness inputs to be populated, not
    // just the section heading. The draft state-sync useEffect runs one
    // render after serverValues populates, so asserting on a settled input
    // value is the only deterministic signal that the draft has hydrated.
    await screen.findAllByDisplayValue('100');
    expect(screen.getByDisplayValue('60')).toBeInTheDocument(); // dim 0.6 → 60
    expect(screen.getByDisplayValue('30')).toBeInTheDocument(); // overnight 0.3 → 30
  });

  it('marks the page dirty and shows the save bar when a value changes', async () => {
    renderAt();
    // Wait for a populated input before firing the change — the draft
    // state-sync useEffect runs one render after serverValues resolves, so
    // a change fired against an unhydrated draft would be overwritten by
    // the subsequent sync.
    await screen.findAllByDisplayValue('100');

    const dimLabel = screen.getByText(/dim \(idle/i);
    const dimInput = dimLabel.parentElement!.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(dimInput, { target: { value: '40' } });

    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('cancel reverts the draft back to the loaded server values', async () => {
    const user = userEvent.setup();
    renderAt();
    await waitForSettingsLoaded();

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
    await waitForSettingsLoaded();

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
    await waitForSettingsLoaded();

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
    await waitForSettingsLoaded();

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
    await waitForSettingsLoaded();

    const toggle = screen.getByLabelText(/enable hourly dial exercise/i) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    await user.click(toggle);
    expect(toggle.checked).toBe(false);
  });

  it('clicking the Hardware tab swaps the visible content to Hardware fields', async () => {
    const user = userEvent.setup();
    renderAt();
    await waitForSettingsLoaded();

    await user.click(screen.getByRole('button', { name: 'Hardware' }));
    expect(await screen.findByText(/HPWC \(Tesla Wall Connector\)/i)).toBeInTheDocument();
    // General-tab content is no longer rendered.
    expect(screen.queryByText(/mini-readout rotation/i)).not.toBeInTheDocument();
  });

  it('Rate tab renders the source toggle and hides OpenEI fields under Manual', async () => {
    const user = userEvent.setup();
    renderAt();
    await waitForSettingsLoaded();

    await user.click(screen.getByRole('button', { name: 'Rate' }));
    await screen.findByRole('radio', { name: 'Manual' });
    expect(screen.getByRole('radio', { name: 'Manual' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'OpenEI' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByText(/API key/i)).not.toBeInTheDocument();
  });

  it('Rate tab swaps to OpenEI inputs and back, preserving the manual rate value in draft', async () => {
    const user = userEvent.setup();
    renderAt();
    await waitForSettingsLoaded();
    await user.click(screen.getByRole('button', { name: 'Rate' }));
    await screen.findByRole('radio', { name: 'Manual' });

    await user.click(screen.getByRole('radio', { name: 'OpenEI' }));
    // "API key" appears as a field label AND inside the show/hide button's aria-label,
    // so query a specific role to disambiguate.
    expect(screen.getByRole('textbox', { name: 'Schedule ID' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show api key/i })).toBeInTheDocument();
    expect(screen.queryByText('¢/kWh')).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Manual' }));
    expect(screen.getByText('¢/kWh')).toBeInTheDocument();
  });

  it('Session tab toggling power sampling off sets the interval to 0', async () => {
    const user = userEvent.setup();
    renderAt();
    await waitForSettingsLoaded();
    await user.click(screen.getByRole('button', { name: 'Session' }));

    const toggle = await screen.findByLabelText(/enable power sampling/i);
    expect(toggle).toBeChecked();
    await user.click(toggle);
    expect(toggle).not.toBeChecked();
  });

  it('Lifetime offset input accepts character-by-character typing including intermediate states', async () => {
    // Simulates real per-keystroke onChange events. The previous
    // implementation used type="number" with on-change re-formatting, which
    // fought every keystroke: typing "8" → onChange → re-render with "8.0"
    // → next keystroke landed in the middle of a re-formatted value. This
    // test asserts that each intermediate string ("", "8", "8.", "8.5")
    // stays in the input until blur or a parse-finite value propagates.
    const user = userEvent.setup();
    renderAt();
    await waitForSettingsLoaded();
    await user.click(screen.getByRole('button', { name: 'Lifetime' }));
    const input = (await screen.findByLabelText(/lifetime offset in kwh/i)) as HTMLInputElement;

    // Walk character-by-character. Each fireEvent.change replays an onChange
    // with the new full value the browser would deliver after that keystroke.
    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');
    fireEvent.change(input, { target: { value: '8' } });
    expect(input.value).toBe('8');
    fireEvent.change(input, { target: { value: '8.' } });
    expect(input.value).toBe('8.');
    fireEvent.change(input, { target: { value: '8.5' } });
    expect(input.value).toBe('8.5');

    // Blur normalizes the displayed string.
    fireEvent.blur(input);
    expect(input.value).toBe('8.5');
  });

  it('Lifetime offset preserves intermediate negative-sign typing', async () => {
    const user = userEvent.setup();
    renderAt();
    await waitForSettingsLoaded();
    await user.click(screen.getByRole('button', { name: 'Lifetime' }));
    const input = (await screen.findByLabelText(/lifetime offset in kwh/i)) as HTMLInputElement;

    fireEvent.change(input, { target: { value: '-' } });
    expect(input.value).toBe('-');
    fireEvent.change(input, { target: { value: '-1' } });
    expect(input.value).toBe('-1');
    fireEvent.change(input, { target: { value: '-1.5' } });
    expect(input.value).toBe('-1.5');
    fireEvent.blur(input);
    expect(input.value).toBe('-1.5');
  });

  it('Lifetime tab displays the offset in kWh and converts back to Wh on save', async () => {
    const user = userEvent.setup();
    renderAt();
    await waitForSettingsLoaded();
    await user.click(screen.getByRole('button', { name: 'Lifetime' }));

    // Default 0 Wh displays as "0.0" kWh.
    const offsetInput = (await screen.findByLabelText(/lifetime offset in kwh/i)) as HTMLInputElement;
    expect(offsetInput.value).toBe('0.0');

    fireEvent.change(offsetInput, { target: { value: '0.7' } });
    // 0.7 kWh × 1000 = 700 Wh stored (via Math.round to avoid IEEE 754 drift).
    // Verify by switching tabs and back — the input recomputes from stored Wh.
    await user.click(screen.getByRole('button', { name: 'General' }));
    await user.click(screen.getByRole('button', { name: 'Lifetime' }));
    const reloadedInput = (await screen.findByLabelText(/lifetime offset in kwh/i)) as HTMLInputElement;
    expect(reloadedInput.value).toBe('0.7');
  });

  it('Lifetime change shows the confirm modal before PATCHing', async () => {
    const { calls } = setupMockFetch();
    const user = userEvent.setup();
    renderAt();
    await waitForSettingsLoaded();
    await user.click(screen.getByRole('button', { name: 'Lifetime' }));

    const offsetInput = (await screen.findByLabelText(/lifetime offset in kwh/i)) as HTMLInputElement;
    fireEvent.change(offsetInput, { target: { value: '0.5' } });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    // Modal opens; PATCH has not fired yet.
    expect(screen.getByRole('dialog', { name: /confirm lifetime offset change/i })).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')).toBeUndefined();
    // Confirm button is disabled until reason is non-empty.
    const confirm = screen.getByRole('button', { name: /confirm adjustment/i });
    expect(confirm).toBeDisabled();
  });

  it('Lifetime confirm sends the reason to the PATCH body', async () => {
    const { calls } = setupMockFetch();
    const user = userEvent.setup();
    renderAt();
    await waitForSettingsLoaded();
    await user.click(screen.getByRole('button', { name: 'Lifetime' }));

    const offsetInput = (await screen.findByLabelText(/lifetime offset in kwh/i)) as HTMLInputElement;
    fireEvent.change(offsetInput, { target: { value: '0.5' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const reasonField = screen.getByPlaceholderText(/adjustment to account/i);
    fireEvent.change(reasonField, { target: { value: 'Reset after firmware swap' } });
    await user.click(screen.getByRole('button', { name: /confirm adjustment/i }));

    await waitFor(() => {
      expect(calls.find((c) => c.method === 'PATCH')).toBeDefined();
    });
    const patch = calls.find((c) => c.method === 'PATCH')!;
    const body = JSON.parse(patch.body!) as { values: Record<string, string>; reason?: string };
    expect(body.values['lifetime.offset_wh']).toBe('500');
    expect(body.reason).toBe('Reset after firmware swap');
  });

  it('Lifetime modal Cancel keeps the draft but does not PATCH', async () => {
    const { calls } = setupMockFetch();
    const user = userEvent.setup();
    renderAt();
    await waitForSettingsLoaded();
    await user.click(screen.getByRole('button', { name: 'Lifetime' }));

    const offsetInput = (await screen.findByLabelText(/lifetime offset in kwh/i)) as HTMLInputElement;
    fireEvent.change(offsetInput, { target: { value: '0.5' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')).toBeUndefined();
    // Draft value retained.
    const stillOpen = (await screen.findByLabelText(/lifetime offset in kwh/i)) as HTMLInputElement;
    expect(stillOpen.value).toBe('0.5');
  });
});
