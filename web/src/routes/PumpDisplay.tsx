import { useEffect } from 'react';
import { startPumpHub } from '../lib/pumpHubClient';
import { usePumpStore } from '../stores/pumpStore';
import { useStaleData } from '../hooks/useStaleData';
import { useRotatingIndex } from '../hooks/useRotatingIndex';
import { OdometerDial, MiniReadout } from '../components/dials';
import type { MiniReadoutProps } from '../components/dials';
import KioskFrame from '../components/shared/KioskFrame';
import type { PumpState } from '../types/PumpState';
import {
  formatDecimal,
  formatInteger,
  formatDuration,
  READOUT_DONE,
} from '../lib/displayFormat';

export default function PumpDisplay() {
  const state = usePumpStore((s) => s.state);
  const receivedAt = usePumpStore((s) => s.receivedAt);
  const connection = usePumpStore((s) => s.connection);
  const isStale = useStaleData(receivedAt);

  useEffect(() => {
    startPumpHub();
  }, []);

  const showWarning = isStale || connection === 'disconnected';

  const sessionDollars = (state?.session?.costCents ?? 0) / 100;
  const sessionKwh = state?.session?.energyKwh ?? 0;
  const ratePerKwh = (state?.rate.centsPerKwh ?? 0) / 100;

  // Zone 2 (USAGE) — always rotates between lifetime / YTD / session count.
  const usageRotations = buildUsageRotations(state);
  const usageIndex = useRotatingIndex(usageRotations.length);
  const usage = usageRotations[usageIndex];

  // Zone 3 (SESSION) — pinned during plugged/charging/complete, rotates when idle.
  const sessionRotations = buildSessionRotations(state);
  const sessionIndex = useRotatingIndex(sessionRotations.length);
  const session = sessionRotations[sessionIndex];

  return (
    <KioskFrame>
    <div className="bg-black text-white w-[768px] h-[1024px] mx-auto relative font-mono">
      {showWarning && (
        <div className="absolute top-2 right-2 text-xs bg-yellow-500 text-black px-2 py-1 rounded">
          ⚠ reconnecting
        </div>
      )}

      <Zone label="THIS $ SALE">
        <div className="flex items-center gap-3">
          <FlankLabel>$</FlankLabel>
          <OdometerDial value={sessionDollars} digits={2} decimals={2} size="large" hasDCap />
          <FlankLabel>SALE</FlankLabel>
        </div>
      </Zone>

      <Zone label="USAGE">
        <MiniReadout icon={usage.icon} value={usage.value} unit={usage.unit} />
      </Zone>

      <Zone label="SESSION">
        <MiniReadout icon={session.icon} value={session.value} unit={session.unit} />
      </Zone>

      <Zone label="kWh DELIVERED">
        <OdometerDial value={sessionKwh} digits={3} decimals={1} size="large" hasDCap />
      </Zone>

      <Zone label="PRICE PER kWh">
        <div className="flex items-center gap-2">
          <FlankLabel small>$</FlankLabel>
          <OdometerDial value={ratePerKwh} digits={1} decimals={2} size="small" />
        </div>
      </Zone>

      <div className="absolute bottom-2 left-2 text-xs text-neutral-500">
        state: {state?.state ?? '—'} · conn: {connection}
      </div>
    </div>
    </KioskFrame>
  );
}

function buildUsageRotations(state: PumpState | null): MiniReadoutProps[] {
  const totals = state?.totals;
  return [
    { icon: '📊', value: formatDecimal(totals?.lifetimeKwh ?? 0), unit: 'kWh' },
    { icon: '🗓️', value: formatDecimal(totals?.yearToDateKwh ?? 0), unit: 'kWh YTD' },
    { icon: '🔢', value: formatInteger(totals?.sessionCount ?? 0), unit: 'sessions' },
  ];
}

function buildSessionRotations(state: PumpState | null): MiniReadoutProps[] {
  const liveKw = state?.session?.liveKw ?? 0;
  const sessionKwh = state?.session?.energyKwh ?? 0;
  const durationSeconds = state?.session?.durationSeconds ?? 0;

  switch (state?.state) {
    case 'charging':
      return [{ icon: '⚡', value: formatDecimal(liveKw), unit: 'kW' }];
    case 'session_complete':
      return [{ icon: '⚡', value: READOUT_DONE, unit: 'Done' }];
    case 'plugged_not_charging':
      return [{ icon: '⚡', value: formatDecimal(0), unit: 'kW' }];
    case 'idle':
    default:
      // Rotate between duration and kWh added — skip live kW since it'd be 0.
      return [
        { icon: '⏱️', value: formatDuration(durationSeconds), unit: '' },
        { icon: '🔋', value: formatDecimal(sessionKwh), unit: 'kWh' },
      ];
  }
}

function Zone({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-12 py-4 border-b border-neutral-900">
      <div className="text-neutral-500 text-xs uppercase tracking-widest">{label}</div>
      <div className="mt-2 flex items-center justify-center">{children}</div>
    </div>
  );
}

function FlankLabel({ children, small = false }: { children: React.ReactNode; small?: boolean }) {
  // The "$" / "SALE" wording lives on the physical pump faceplate as vinyl
  // stickers; the kiosk only renders values inside the cutouts. Until we wire
  // the preview-mode URL toggle, render them inline so the layout reads.
  const sizeCls = small ? 'text-3xl' : 'text-5xl';
  return (
    <span className={`font-odometer font-black ${sizeCls}`} style={{ color: '#f8f3e1' }}>
      {children}
    </span>
  );
}
