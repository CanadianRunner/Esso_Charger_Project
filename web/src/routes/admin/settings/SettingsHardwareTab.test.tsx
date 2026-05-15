import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import SettingsHardwareTab from './SettingsHardwareTab';

const VALUES: Record<string, string> = {
  'hpwc.host': '192.168.1.42',
  'hpwc.poll_interval_active_ms': '1000',
  'hpwc.poll_interval_idle_ms': '5000',
  'hpwc.timeout_ms': '3000',
  'shelly.host': '',
};

interface FetchCall {
  url: string;
  method: string;
  body?: string;
}

function setupMockFetch(opts: {
  testResult?: { success: boolean; latencyMs: number; error?: string; details?: Record<string, string> };
  infoOverride?: { hpwc?: { mode: string }; shelly?: { mode: string; enabled: boolean } };
} = {}) {
  const calls: FetchCall[] = [];
  global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const u = url.toString();
    calls.push({ url: u, method: init?.method ?? 'GET', body: init?.body as string });
    if (u.endsWith('/api/admin/hardware') && (init?.method ?? 'GET') === 'GET') {
      return Promise.resolve(json({
        hpwc: opts.infoOverride?.hpwc ?? { mode: 'Real', enabled: null },
        shelly: opts.infoOverride?.shelly ?? { mode: 'Fake', enabled: true },
      }));
    }
    if (u.includes('/api/admin/hardware/test-')) {
      const r = opts.testResult ?? { success: true, latencyMs: 47, details: { host: '192.168.1.42', port: '80' } };
      return Promise.resolve(json({
        success: r.success,
        latencyMs: r.latencyMs,
        error: r.error ?? null,
        details: r.details ?? null,
      }));
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  }) as unknown as typeof fetch;
  return calls;
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('SettingsHardwareTab', () => {
  beforeEach(() => { setupMockFetch(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('renders mode pills from /api/admin/hardware', async () => {
    render(<SettingsHardwareTab values={VALUES} fieldErrors={{}} onChange={() => undefined} />);
    expect(await screen.findByText('Real')).toBeInTheDocument();
    expect(screen.getByText('Fake')).toBeInTheDocument();
  });

  it('renders the Shelly Enabled pill as Yes / No based on the info response', async () => {
    setupMockFetch({ infoOverride: { shelly: { mode: 'Real', enabled: false } } });
    render(<SettingsHardwareTab values={VALUES} fieldErrors={{}} onChange={() => undefined} />);
    expect(await screen.findByText('No')).toBeInTheDocument();
  });

  it('renders host + timing inputs bound to the values prop', async () => {
    render(<SettingsHardwareTab values={VALUES} fieldErrors={{}} onChange={() => undefined} />);
    await screen.findByText('Real');
    expect(screen.getByDisplayValue('192.168.1.42')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('5000')).toBeInTheDocument();
    expect(screen.getByDisplayValue('3000')).toBeInTheDocument();
  });

  it('Test connection is disabled when host is empty', async () => {
    render(<SettingsHardwareTab values={{ ...VALUES, 'hpwc.host': '' }} fieldErrors={{}} onChange={() => undefined} />);
    await screen.findByText('Real');
    // Both test buttons disabled (HPWC empty + Shelly empty in VALUES).
    const buttons = screen.getAllByRole('button', { name: /test connection/i });
    expect(buttons).toHaveLength(2);
    buttons.forEach((b) => expect(b).toBeDisabled());
  });

  it('clicking Test connection POSTs the host and renders the success line', async () => {
    const calls = setupMockFetch({
      testResult: { success: true, latencyMs: 47, details: { host: '192.168.1.42', port: '80' } },
    });
    const user = userEvent.setup();
    render(<SettingsHardwareTab values={VALUES} fieldErrors={{}} onChange={() => undefined} />);
    await screen.findByText('Real');

    const hpwcRow = screen.getByDisplayValue('192.168.1.42').parentElement!.parentElement!;
    const testBtn = hpwcRow.querySelector('button')!;
    await user.click(testBtn);

    await screen.findByText(/reachable on port 80 \(47ms\)/i);
    const post = calls.find((c) => c.method === 'POST' && c.url.includes('test-hpwc'));
    expect(post).toBeDefined();
    expect(JSON.parse(post!.body!)).toEqual({ host: '192.168.1.42' });
  });

  it('renders the specific error message from the server on failure', async () => {
    setupMockFetch({
      testResult: {
        success: false,
        latencyMs: 5012,
        error: 'No response from 192.168.1.42 within 5s — check the IP address and network connectivity.',
      },
    });
    const user = userEvent.setup();
    render(<SettingsHardwareTab values={VALUES} fieldErrors={{}} onChange={() => undefined} />);
    await screen.findByText('Real');

    const hpwcRow = screen.getByDisplayValue('192.168.1.42').parentElement!.parentElement!;
    await user.click(hpwcRow.querySelector('button')!);
    expect(await screen.findByText(/no response from 192.168.1.42 within 5s/i)).toBeInTheDocument();
  });

  it('editing the host clears any prior test result', async () => {
    setupMockFetch({ testResult: { success: true, latencyMs: 47, details: { port: '80' } } });
    const onChange = vi.fn();
    const user = userEvent.setup();

    // Use a wrapper that lets us pass new values after the change callback fires.
    function Wrapper() {
      const [v, setV] = (function makeState() {
        const [s, setS] = (require('react') as typeof import('react')).useState<Record<string, string>>(VALUES);
        return [s, setS] as const;
      })();
      return (
        <SettingsHardwareTab
          values={v}
          fieldErrors={{}}
          onChange={(key, val) => {
            onChange(key, val);
            setV((prev) => ({ ...prev, [key]: val }));
          }}
        />
      );
    }

    render(<Wrapper />);
    await screen.findByText('Real');

    const hpwcInput = screen.getByDisplayValue('192.168.1.42') as HTMLInputElement;
    const testBtn = hpwcInput.parentElement!.parentElement!.querySelector('button')!;
    await user.click(testBtn);
    await screen.findByText(/reachable on port 80 \(47ms\)/i);

    // Now edit the host — the prior result should clear.
    fireEvent.change(hpwcInput, { target: { value: '10.0.0.1' } });
    await waitFor(() => {
      expect(screen.queryByText(/reachable on port 80/i)).not.toBeInTheDocument();
    });
  });

  it('shows a loading indicator while the test is in flight', async () => {
    global.fetch = vi.fn((url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.endsWith('/api/admin/hardware')) {
        return Promise.resolve(json({
          hpwc: { mode: 'Real', enabled: null },
          shelly: { mode: 'Fake', enabled: true },
        }));
      }
      // Never-resolving promise so the loading state stays visible. The test
      // unmounts before resolving, so no late state update can fire.
      return new Promise<Response>(() => undefined);
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    const { unmount } = render(
      <SettingsHardwareTab values={VALUES} fieldErrors={{}} onChange={() => undefined} />,
    );
    await screen.findByText('Real');

    const hpwcInput = screen.getByDisplayValue('192.168.1.42') as HTMLInputElement;
    const testBtn = hpwcInput.parentElement!.parentElement!.querySelector('button') as HTMLButtonElement;
    await user.click(testBtn);

    expect(testBtn).toBeDisabled();
    expect(testBtn).toHaveTextContent(/testing…/i);

    unmount();
  });
});
