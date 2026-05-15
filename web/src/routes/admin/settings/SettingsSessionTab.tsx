import type { SettingsDraft } from '../../../types/AdminSettings';

const K = {
  MergeGraceSeconds: 'session.merge_grace_seconds',
  IdleThresholdAmps: 'session.idle_threshold_amps',
  PowerSampleIntervalSeconds: 'session.power_sample_interval_seconds',
} as const;

interface Props {
  values: SettingsDraft;
  fieldErrors: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export default function SettingsSessionTab({ values, fieldErrors, onChange }: Props) {
  const samplingEnabled = Number(values[K.PowerSampleIntervalSeconds] ?? '0') > 0;

  return (
    <div className="space-y-6">
      <Section title="Session detection">
        <NumberField
          label="Merge grace window"
          unit="seconds"
          value={values[K.MergeGraceSeconds]}
          error={fieldErrors[K.MergeGraceSeconds]}
          onChange={(v) => onChange(K.MergeGraceSeconds, v)}
          min={0}
          max={3600}
        />
        <p className="text-xs text-neutral-500">
          If a vehicle unplugs and replugs within this window, the two segments merge into a single session.
        </p>
        <NumberField
          label="Idle current threshold"
          unit="A"
          value={values[K.IdleThresholdAmps]}
          error={fieldErrors[K.IdleThresholdAmps]}
          onChange={(v) => onChange(K.IdleThresholdAmps, v)}
          min={0}
          max={20}
          step={0.1}
        />
        <p className="text-xs text-neutral-500">
          Current draw below this level is treated as idle (not actively charging).
        </p>
      </Section>

      <Section title="Power sampling">
        <Toggle
          label="Enable power sampling during charging"
          checked={samplingEnabled}
          onChange={(enabled) => {
            onChange(K.PowerSampleIntervalSeconds, enabled ? '10' : '0');
          }}
        />
        {samplingEnabled && (
          <NumberField
            label="Sample interval"
            unit="seconds"
            value={values[K.PowerSampleIntervalSeconds]}
            error={fieldErrors[K.PowerSampleIntervalSeconds]}
            onChange={(v) => onChange(K.PowerSampleIntervalSeconds, v)}
            min={1}
            max={3600}
          />
        )}
        <p className="text-xs text-neutral-500">
          Captures kW readings on this interval, used to render the per-session power chart.
        </p>
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

function NumberField({
  label,
  unit,
  value,
  error,
  onChange,
  min,
  max,
  step,
}: {
  label: string;
  unit?: string;
  value: string | undefined;
  error?: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: number;
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
          step={step}
          onChange={(e) => onChange(e.target.value)}
          className="bg-neutral-950 border border-neutral-700 rounded px-3 py-1.5 text-neutral-100 w-32 tabular-nums focus:outline-none focus:border-amber-400"
        />
        {unit && <span className="text-xs text-neutral-500">{unit}</span>}
      </div>
      {error && <p className="mt-1 text-xs text-red-400" role="alert">{error}</p>}
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm text-neutral-300">{label}</span>
    </label>
  );
}
