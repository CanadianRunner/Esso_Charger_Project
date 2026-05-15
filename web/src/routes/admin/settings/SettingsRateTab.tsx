import { useState } from 'react';
import type { SettingsDraft } from '../../../types/AdminSettings';

const K = {
  Source: 'rate.source',
  FlatCentsPerKwh: 'rate.flat_cents_per_kwh',
  OpenEiApiKey: 'rate.openei_api_key',
  OpenEiScheduleId: 'rate.openei_schedule_id',
} as const;

interface Props {
  values: SettingsDraft;
  fieldErrors: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export default function SettingsRateTab({ values, fieldErrors, onChange }: Props) {
  const source = (values[K.Source] ?? 'manual') as 'manual' | 'openei';

  return (
    <div className="space-y-6">
      <Section title="Rate source">
        <SourceToggle
          value={source}
          onChange={(v) => onChange(K.Source, v)}
        />
        <p className="text-xs text-neutral-500">
          {source === 'manual'
            ? 'A fixed cents-per-kWh rate is used for every session.'
            : 'OpenEI pulls a utility-rate schedule by ID; PumpCharger refreshes daily.'}
        </p>
      </Section>

      {source === 'manual' && (
        <Section title="Manual rate">
          <NumberField
            label="Rate"
            unit="¢/kWh"
            value={values[K.FlatCentsPerKwh]}
            error={fieldErrors[K.FlatCentsPerKwh]}
            onChange={(v) => onChange(K.FlatCentsPerKwh, v)}
            min={0}
            max={1000}
          />
        </Section>
      )}

      {source === 'openei' && (
        <Section title="OpenEI configuration">
          <ApiKeyField
            label="API key"
            value={values[K.OpenEiApiKey]}
            error={fieldErrors[K.OpenEiApiKey]}
            onChange={(v) => onChange(K.OpenEiApiKey, v)}
          />
          <TextField
            label="Schedule ID"
            value={values[K.OpenEiScheduleId]}
            error={fieldErrors[K.OpenEiScheduleId]}
            placeholder="e.g. 5b9f8c8d5457a31f5c4f0bce"
            onChange={(v) => onChange(K.OpenEiScheduleId, v)}
          />
        </Section>
      )}
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

function SourceToggle({
  value,
  onChange,
}: {
  value: 'manual' | 'openei';
  onChange: (v: 'manual' | 'openei') => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Rate source"
      className="inline-flex gap-1 bg-neutral-950 p-1 rounded border border-neutral-700"
    >
      <SourceButton selected={value === 'manual'} onClick={() => onChange('manual')}>
        Manual
      </SourceButton>
      <SourceButton selected={value === 'openei'} onClick={() => onChange('openei')}>
        OpenEI
      </SourceButton>
    </div>
  );
}

function SourceButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded ${
        selected
          ? 'bg-amber-400 text-neutral-900 font-medium'
          : 'text-neutral-300 hover:bg-neutral-800'
      }`}
    >
      {children}
    </button>
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

function TextField({
  label,
  value,
  error,
  placeholder,
  onChange,
}: {
  label: string;
  value: string | undefined;
  error?: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-sm text-neutral-300 mb-1">{label}</span>
      <input
        type="text"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="bg-neutral-950 border border-neutral-700 rounded px-3 py-1.5 text-neutral-100 w-72 max-w-full focus:outline-none focus:border-amber-400"
      />
      {error && <p className="mt-1 text-xs text-red-400" role="alert">{error}</p>}
    </label>
  );
}

/**
 * API key input. Masked by default; the show/hide toggle is a small click-and-
 * peek affordance for the admin verifying a paste, but the field returns to
 * masked once they look away. Mitigates shoulder-surfing during screen sharing
 * or remote support sessions even though the backend doesn't enforce secrecy
 * (anyone with admin auth can read it via GET /settings).
 */
function ApiKeyField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string | undefined;
  error?: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="block text-sm text-neutral-300 mb-1">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type={show ? 'text' : 'password'}
          value={value ?? ''}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          className="bg-neutral-950 border border-neutral-700 rounded px-3 py-1.5 text-neutral-100 w-72 max-w-full font-mono text-sm focus:outline-none focus:border-amber-400"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide API key' : 'Show API key'}
          className="text-xs px-2 py-1.5 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-400" role="alert">{error}</p>}
    </label>
  );
}
