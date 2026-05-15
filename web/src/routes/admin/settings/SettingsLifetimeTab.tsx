import { useEffect, useState } from 'react';
import type { SettingsDraft } from '../../../types/AdminSettings';

const K = {
  OffsetWh: 'lifetime.offset_wh',
} as const;

interface Props {
  values: SettingsDraft;
  fieldErrors: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export default function SettingsLifetimeTab({ values, fieldErrors, onChange }: Props) {
  // Local raw text state so the user can type freely — intermediate strings
  // like "8.", "-", or "" stay in the field instead of being immediately
  // re-formatted. type="number" with on-change re-formatting fights every
  // keystroke; type="text" + inputMode="decimal" gives a numeric keypad on
  // mobile without the cross-browser quirks of <input type="number"> (step
  // snapping, scroll-wheel mutation, locale-specific separators).
  const propValueWh = values[K.OffsetWh] ?? '0';
  const [rawValue, setRawValue] = useState(() => whToKwhString(propValueWh));

  // Re-sync from prop when it changes externally (cancel reverts the draft,
  // save returns refreshed server values, initial draft hydration). Suppress
  // re-sync when our own propagated change is just coming back as the same
  // numeric value — preserves the user's exact typed string (e.g., "8.")
  // during active editing.
  useEffect(() => {
    const propKwh = Number(propValueWh) / 1000;
    const localKwh = parseFloat(rawValue);
    if (!Number.isFinite(localKwh) || Math.abs(propKwh - localKwh) > 1e-6) {
      setRawValue(whToKwhString(propValueWh));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propValueWh]);

  const handleChange = (text: string) => {
    setRawValue(text);
    // Propagate to parent only when we can parse a finite number; intermediate
    // states like "8.", "-", or "" stay local until blur normalizes them.
    const trimmed = text.trim();
    if (trimmed === '' || trimmed === '-') return;
    const kwh = parseFloat(trimmed);
    if (Number.isFinite(kwh)) {
      // Explicit rounding to integer Wh — Math.round resolves 0.7 * 1000
      // (= 699.9999…) cleanly, including for negative values
      // (Math.round(-1.5 * 1000) = -1500).
      onChange(K.OffsetWh, String(Math.round(kwh * 1000)));
    }
  };

  const handleBlur = () => {
    const kwh = parseFloat(rawValue);
    if (!Number.isFinite(kwh)) {
      // Invalid leftover string — revert to the last stored value.
      setRawValue(whToKwhString(propValueWh));
      return;
    }
    // Normalize the display and persist the rounded Wh.
    const wh = Math.round(kwh * 1000);
    setRawValue((wh / 1000).toFixed(1));
    onChange(K.OffsetWh, String(wh));
  };

  return (
    <div className="space-y-6">
      <Section title="Lifetime energy offset">
        <p className="text-sm text-neutral-300 leading-relaxed">
          Adjusts the lifetime energy total shown on the kiosk dial. Use this to correct for
          energy delivered before this software was installed, or to reset after hardware
          replacement. Negative values subtract from the running total. Changes are logged
          with the reason you provide when saving.
        </p>
        <label className="block">
          <span className="block text-sm text-neutral-300 mb-1">Offset</span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={rawValue}
              aria-label="Lifetime offset in kWh"
              onChange={(e) => handleChange(e.target.value)}
              onBlur={handleBlur}
              className="bg-neutral-950 border border-neutral-700 rounded px-3 py-1.5 text-neutral-100 w-40 tabular-nums focus:outline-none focus:border-amber-400"
            />
            <span className="text-xs text-neutral-500">kWh</span>
          </div>
          {fieldErrors[K.OffsetWh] && (
            <p className="mt-1 text-xs text-red-400" role="alert">{fieldErrors[K.OffsetWh]}</p>
          )}
        </label>
        <p className="text-xs text-neutral-500">
          Stored as Wh; displayed here in kWh for readability.
        </p>
      </Section>
    </div>
  );
}

function whToKwhString(whString: string): string {
  const wh = Number(whString);
  if (!Number.isFinite(wh)) return '0.0';
  return (wh / 1000).toFixed(1);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 space-y-3">
      <h3 className="text-xs uppercase tracking-wider text-neutral-500">{title}</h3>
      {children}
    </section>
  );
}
