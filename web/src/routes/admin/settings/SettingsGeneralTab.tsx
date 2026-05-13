import type { SettingsDraft } from '../../../types/AdminSettings';

const K = {
  MiniRotationSeconds: 'display.mini_rotation_seconds',
  PostSessionBrightSeconds: 'display.post_session_bright_seconds',
  PostSessionDimSeconds: 'display.post_session_dim_seconds',
  BrightnessActive: 'display.brightness_active',
  BrightnessDim: 'display.brightness_dim',
  BrightnessOvernight: 'display.brightness_overnight',
  OvernightStartHour: 'display.overnight_start_hour',
  OvernightEndHour: 'display.overnight_end_hour',
  DialExerciseIntervalSeconds: 'display.dial_exercise_interval_seconds',
} as const;

interface Props {
  values: SettingsDraft;
  fieldErrors: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export default function SettingsGeneralTab({ values, fieldErrors, onChange }: Props) {
  const overnightEnabled =
    (values[K.OvernightStartHour] ?? '') !== (values[K.OvernightEndHour] ?? '');
  const exerciseEnabled = Number(values[K.DialExerciseIntervalSeconds] ?? '0') > 0;

  return (
    <div className="space-y-6">
      <Section title="Display rotation">
        <NumberField
          label="Mini-readout rotation"
          unit="seconds"
          value={values[K.MiniRotationSeconds]}
          error={fieldErrors[K.MiniRotationSeconds]}
          onChange={(v) => onChange(K.MiniRotationSeconds, v)}
          min={1}
          max={600}
        />
      </Section>

      <Section title="Post-session linger">
        <NumberField
          label="Bright window"
          unit="seconds"
          value={values[K.PostSessionBrightSeconds]}
          error={fieldErrors[K.PostSessionBrightSeconds]}
          onChange={(v) => onChange(K.PostSessionBrightSeconds, v)}
          min={0}
          max={3600}
        />
        <NumberField
          label="Dim window"
          unit="seconds"
          value={values[K.PostSessionDimSeconds]}
          error={fieldErrors[K.PostSessionDimSeconds]}
          onChange={(v) => onChange(K.PostSessionDimSeconds, v)}
          min={0}
          max={3600}
        />
      </Section>

      <Section title="Brightness levels">
        <PercentField
          label="Active (charging / session complete)"
          value={values[K.BrightnessActive]}
          error={fieldErrors[K.BrightnessActive]}
          onChange={(decimal) => onChange(K.BrightnessActive, decimal)}
        />
        <PercentField
          label="Dim (idle / plugged not charging)"
          value={values[K.BrightnessDim]}
          error={fieldErrors[K.BrightnessDim]}
          onChange={(decimal) => onChange(K.BrightnessDim, decimal)}
        />
        <PercentField
          label="Overnight"
          value={values[K.BrightnessOvernight]}
          error={fieldErrors[K.BrightnessOvernight]}
          onChange={(decimal) => onChange(K.BrightnessOvernight, decimal)}
        />
      </Section>

      <Section title="Overnight dimming">
        <Toggle
          label="Enable overnight dimming"
          checked={overnightEnabled}
          onChange={(enabled) => {
            if (enabled) {
              // Re-enable with sensible default window if user is toggling on
              // from a previously-disabled (equal-hours) state.
              if (!overnightEnabled) {
                onChange(K.OvernightStartHour, '23');
                onChange(K.OvernightEndHour, '6');
              }
            } else {
              // Disabled semantic: start === end. Match end to start so the
              // saved value still reflects user's preferred hours visually.
              const start = values[K.OvernightStartHour] ?? '0';
              onChange(K.OvernightEndHour, start);
            }
          }}
        />
        {overnightEnabled && (
          <div className="flex gap-3">
            <HourField
              label="Start hour"
              value={values[K.OvernightStartHour]}
              error={fieldErrors[K.OvernightStartHour]}
              onChange={(v) => onChange(K.OvernightStartHour, v)}
            />
            <HourField
              label="End hour"
              value={values[K.OvernightEndHour]}
              error={fieldErrors[K.OvernightEndHour]}
              onChange={(v) => onChange(K.OvernightEndHour, v)}
            />
          </div>
        )}
        <p className="text-xs text-neutral-500">
          24-hour local time. Window may cross midnight (e.g. 23 → 6).
        </p>
      </Section>

      <Section title="Dial burn-in exercise">
        <Toggle
          label="Enable hourly dial exercise during idle"
          checked={exerciseEnabled}
          onChange={(enabled) => {
            onChange(K.DialExerciseIntervalSeconds, enabled ? '3600' : '0');
          }}
        />
        {exerciseEnabled && (
          <NumberField
            label="Exercise interval"
            unit="seconds"
            value={values[K.DialExerciseIntervalSeconds]}
            error={fieldErrors[K.DialExerciseIntervalSeconds]}
            onChange={(v) => onChange(K.DialExerciseIntervalSeconds, v)}
            min={300}
            max={86400}
          />
        )}
        <p className="text-xs text-neutral-500">
          Cycles each dial through 0–9 once per interval to prevent burn-in on the OLED panel.
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

/**
 * Display brightness as 0..100 percent for user friendliness. The stored
 * format is a decimal in [0,1] with at most 2 decimal places; this field
 * converts on read (decimal → %) and on write (% → decimal).
 */
function PercentField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string | undefined;
  error?: string;
  onChange: (storedDecimal: string) => void;
}) {
  const asPercent = value === undefined || value === '' ? '' : String(Math.round(Number(value) * 100));
  return (
    <label className="block">
      <span className="block text-sm text-neutral-300 mb-1">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={asPercent}
          min={0}
          max={100}
          step={1}
          onChange={(e) => {
            const pct = Number(e.target.value);
            if (Number.isNaN(pct)) {
              onChange(e.target.value);
              return;
            }
            const decimal = Math.max(0, Math.min(100, pct)) / 100;
            onChange(decimal.toFixed(2));
          }}
          className="bg-neutral-950 border border-neutral-700 rounded px-3 py-1.5 text-neutral-100 w-24 tabular-nums focus:outline-none focus:border-amber-400"
        />
        <span className="text-xs text-neutral-500">%</span>
      </div>
      {error && <p className="mt-1 text-xs text-red-400" role="alert">{error}</p>}
    </label>
  );
}

function HourField({
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
  return (
    <label className="block">
      <span className="block text-sm text-neutral-300 mb-1">{label}</span>
      <input
        type="number"
        min={0}
        max={23}
        step={1}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="bg-neutral-950 border border-neutral-700 rounded px-3 py-1.5 text-neutral-100 w-24 tabular-nums focus:outline-none focus:border-amber-400"
      />
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
