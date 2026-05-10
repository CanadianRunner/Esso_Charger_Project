import { useEffect } from 'react';
import { startPumpHub } from '../lib/pumpHubClient';
import { usePumpStore } from '../stores/pumpStore';
import { useStaleData } from '../hooks/useStaleData';

export default function PumpDisplay() {
  const state = usePumpStore((s) => s.state);
  const receivedAt = usePumpStore((s) => s.receivedAt);
  const connection = usePumpStore((s) => s.connection);
  const isStale = useStaleData(receivedAt);

  useEffect(() => {
    startPumpHub();
  }, []);

  const showWarning = isStale || connection === 'disconnected';

  return (
    <div className="bg-black text-white w-[768px] h-[1024px] mx-auto relative font-mono">
      {showWarning && (
        <div className="absolute top-2 right-2 text-xs bg-yellow-500 text-black px-2 py-1 rounded">
          ⚠ reconnecting
        </div>
      )}

      <Zone label="THIS $ SALE">
        <PlaceholderDigits value={dollarsFromCents(state?.session?.costCents ?? 0)} size="large" />
      </Zone>

      <Zone label="USAGE">
        <SmallReadout value={`${(state?.totals.lifetimeKwh ?? 0).toFixed(1)} kWh`} icon="📊" />
      </Zone>

      <Zone label="SESSION">
        <SmallReadout
          value={
            state?.state === 'charging'
              ? `${(state?.session?.liveKw ?? 0).toFixed(1)} kW`
              : state?.state === 'session_complete'
              ? '✓ Done'
              : `${(state?.session?.liveKw ?? 0).toFixed(1)} kW`
          }
          icon="⚡"
        />
      </Zone>

      <Zone label="kWh DELIVERED">
        <PlaceholderDigits value={(state?.session?.energyKwh ?? 0).toFixed(1)} size="large" />
      </Zone>

      <Zone label="PRICE PER kWh">
        <PlaceholderDigits value={`$${(((state?.rate.centsPerKwh ?? 0) / 100)).toFixed(2)}`} size="small" />
      </Zone>

      <div className="absolute bottom-2 left-2 text-xs text-neutral-500">
        state: {state?.state ?? '—'} · conn: {connection}
      </div>
    </div>
  );
}

function Zone({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-12 py-4 border-b border-neutral-900">
      <div className="text-neutral-500 text-xs uppercase tracking-widest">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function PlaceholderDigits({ value, size }: { value: string; size: 'small' | 'large' }) {
  const cls = size === 'large' ? 'text-7xl' : 'text-3xl';
  return <div className={`${cls} font-bold tabular-nums`}>{value}</div>;
}

function SmallReadout({ value, icon }: { value: string; icon: string }) {
  return (
    <div className="flex items-center gap-2 text-xl tabular-nums">
      <span>{icon}</span>
      <span>{value}</span>
    </div>
  );
}

function dollarsFromCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}
