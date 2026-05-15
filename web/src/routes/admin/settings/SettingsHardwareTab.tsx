import { useEffect, useState } from 'react';
import { useHardwareTest, type TestState } from '../../../hooks/useHardwareTest';
import type { HardwareInfoResponse, SettingsDraft } from '../../../types/AdminSettings';

const K = {
  HpwcHost: 'hpwc.host',
  HpwcPollIntervalActiveMs: 'hpwc.poll_interval_active_ms',
  HpwcPollIntervalIdleMs: 'hpwc.poll_interval_idle_ms',
  HpwcTimeoutMs: 'hpwc.timeout_ms',
  ShellyHost: 'shelly.host',
} as const;

interface Props {
  values: SettingsDraft;
  fieldErrors: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export default function SettingsHardwareTab({ values, fieldErrors, onChange }: Props) {
  const [info, setInfo] = useState<HardwareInfoResponse | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/hardware', { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as HardwareInfoResponse;
        if (!cancelled) setInfo(body);
      } catch (e) {
        if (!cancelled) setInfoError(e instanceof Error ? e.message : 'failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hpwcTest = useHardwareTest('test-hpwc');
  const shellyTest = useHardwareTest('test-shelly');

  return (
    <div className="space-y-6">
      <Section title="HPWC (Tesla Wall Connector)">
        <ModePill
          label="Mode"
          value={info?.hpwc.mode}
          error={infoError}
        />
        <HostField
          label="Host or IP"
          value={values[K.HpwcHost]}
          error={fieldErrors[K.HpwcHost]}
          placeholder="e.g. 192.168.1.42 or hpwc.local"
          onChange={(v) => {
            onChange(K.HpwcHost, v);
            hpwcTest.reset();
          }}
          test={hpwcTest}
          onTest={() => hpwcTest.run(values[K.HpwcHost] ?? '')}
        />
        <NumberField
          label="Active poll interval"
          unit="ms"
          value={values[K.HpwcPollIntervalActiveMs]}
          error={fieldErrors[K.HpwcPollIntervalActiveMs]}
          onChange={(v) => onChange(K.HpwcPollIntervalActiveMs, v)}
          min={500}
          max={30_000}
        />
        <NumberField
          label="Idle poll interval"
          unit="ms"
          value={values[K.HpwcPollIntervalIdleMs]}
          error={fieldErrors[K.HpwcPollIntervalIdleMs]}
          onChange={(v) => onChange(K.HpwcPollIntervalIdleMs, v)}
          min={500}
          max={60_000}
        />
        <NumberField
          label="Request timeout"
          unit="ms"
          value={values[K.HpwcTimeoutMs]}
          error={fieldErrors[K.HpwcTimeoutMs]}
          onChange={(v) => onChange(K.HpwcTimeoutMs, v)}
          min={500}
          max={30_000}
        />
      </Section>

      <Section title="Shelly EM (optional)">
        <ModePill label="Mode" value={info?.shelly.mode} error={infoError} />
        <ModePill
          label="Enabled"
          value={info?.shelly.enabled === null || info?.shelly.enabled === undefined
            ? undefined
            : info.shelly.enabled ? 'Yes' : 'No'}
          error={infoError}
        />
        <HostField
          label="Host or IP"
          value={values[K.ShellyHost]}
          error={fieldErrors[K.ShellyHost]}
          placeholder="e.g. 192.168.1.43 (leave blank if not used)"
          onChange={(v) => {
            onChange(K.ShellyHost, v);
            shellyTest.reset();
          }}
          test={shellyTest}
          onTest={() => shellyTest.run(values[K.ShellyHost] ?? '')}
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-3">
      <h3 className="text-xs uppercase tracking-wider text-neutral-500">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Read-only pill for values that come from appsettings.json (Mode, Shelly
 * Enabled). The tooltip explains how to change the value, which lives
 * outside the Settings UI surface for this commit.
 */
function ModePill({
  label,
  value,
  error,
}: {
  label: string;
  value: string | undefined;
  error: string | null;
}) {
  const tooltip =
    'This value is set in appsettings.{Environment}.json and applies on backend restart. ' +
    'To change, edit the config file on the host and restart the service.';
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-neutral-400 w-32">{label}</span>
      {error ? (
        <span className="text-red-400 text-xs">{error}</span>
      ) : value === undefined ? (
        <span className="text-neutral-600 text-xs">loading…</span>
      ) : (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-neutral-800 border border-neutral-700 text-neutral-300"
          title={tooltip}
        >
          {value}
          <span aria-hidden className="text-neutral-500 text-[10px]">ⓘ</span>
        </span>
      )}
    </div>
  );
}

function HostField({
  label,
  value,
  error,
  placeholder,
  onChange,
  test,
  onTest,
}: {
  label: string;
  value: string | undefined;
  error?: string;
  placeholder?: string;
  onChange: (v: string) => void;
  test: { state: TestState };
  onTest: () => void;
}) {
  const host = value ?? '';
  const canTest = host.length > 0 && test.state.status !== 'testing';
  return (
    <div className="space-y-1.5">
      <label className="block text-sm text-neutral-300">{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={host}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="bg-neutral-950 border border-neutral-700 rounded px-3 py-1.5 text-neutral-100 w-72 max-w-full focus:outline-none focus:border-amber-400"
        />
        <button
          type="button"
          onClick={onTest}
          disabled={!canTest}
          className="px-3 py-1.5 rounded border border-neutral-700 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {test.state.status === 'testing' ? 'Testing…' : 'Test connection'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
      <TestResult state={test.state} />
    </div>
  );
}

function TestResult({ state }: { state: TestState }) {
  if (state.status !== 'done') return null;
  const r = state.result;
  if (r.success) {
    const port = r.details?.['port'];
    return (
      <p className="text-xs text-emerald-400" role="status">
        Reachable{port ? ` on port ${port}` : ''} ({r.latencyMs}ms).
      </p>
    );
  }
  return (
    <p className="text-xs text-red-400" role="alert">
      {r.error ?? 'Connection failed.'}
    </p>
  );
}

function NumberField({
  label,
  unit,
  value,
  error,
  onChange,
  min,
  max,
}: {
  label: string;
  unit?: string;
  value: string | undefined;
  error?: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="block text-sm text-neutral-300 mb-1">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value ?? ''}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          className="bg-neutral-950 border border-neutral-700 rounded px-3 py-1.5 text-neutral-100 w-32 tabular-nums focus:outline-none focus:border-amber-400"
        />
        {unit && <span className="text-xs text-neutral-500">{unit}</span>}
      </div>
      {error && <p className="mt-1 text-xs text-red-400" role="alert">{error}</p>}
    </label>
  );
}
