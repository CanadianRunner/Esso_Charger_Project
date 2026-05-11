import { useEffect } from 'react';
import { startPumpHub } from '../lib/pumpHubClient';
import { usePumpStore } from '../stores/pumpStore';
import { useStaleData } from '../hooks/useStaleData';
import { useRotatingIndex } from '../hooks/useRotatingIndex';
import { useBrightness } from '../hooks/useBrightness';
import { usePreviewMode } from '../hooks/usePreviewMode';
import { usePixelShifter } from '../hooks/usePixelShifter';
import { useDialExercise, EXERCISE_MULTIPLIERS } from '../hooks/useDialExercise';
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
  const previewMode = usePreviewMode();
  const brightness = useBrightness(state?.state);
  const pixelShift = usePixelShifter();
  const exerciseStep = useDialExercise(state?.state);

  useEffect(() => {
    startPumpHub();
  }, []);

  const showWarning = isStale || connection === 'disconnected';

  const actualDollars = (state?.session?.costCents ?? 0) / 100;
  const actualKwh = state?.session?.energyKwh ?? 0;
  const actualRate = (state?.rate.centsPerKwh ?? 0) / 100;

  // During the dial-exercise hour-tick, override each dial's value with a
  // per-dial multiple of the step so every cell rolls through every digit.
  const sessionDollars = exerciseStep !== null
    ? exerciseStep * EXERCISE_MULTIPLIERS.zone1Dollars
    : actualDollars;
  const sessionKwh = exerciseStep !== null
    ? exerciseStep * EXERCISE_MULTIPLIERS.zone4Kwh
    : actualKwh;
  const ratePerKwh = exerciseStep !== null
    ? exerciseStep * EXERCISE_MULTIPLIERS.zone5Rate
    : actualRate;

  const usageRotations = buildUsageRotations(state);
  const usageIndex = useRotatingIndex(usageRotations.length);
  const usage = usageRotations[usageIndex];

  const sessionRotations = buildSessionRotations(state);
  const sessionIndex = useRotatingIndex(sessionRotations.length);
  const session = sessionRotations[sessionIndex];

  return (
    <KioskFrame>
    <div
      className="bg-black text-white w-[768px] h-[1024px] mx-auto relative font-mono"
      style={{
        filter: `brightness(${brightness})`,
        transform: `translate(${pixelShift.x}px, ${pixelShift.y}px)`,
        transition: 'filter 1.2s ease-in-out, transform 200ms ease-in-out',
      }}
    >
      {showWarning && (
        <div className="absolute top-2 right-2 text-xs bg-yellow-500 text-black px-2 py-1 rounded">
          ⚠ reconnecting
        </div>
      )}

      <Zone label="THIS $ SALE" showLabel={previewMode}>
        <div className="flex items-center gap-3">
          {previewMode && <FlankLabel>$</FlankLabel>}
          <OdometerDial value={sessionDollars} digits={2} decimals={2} size="large" hasDCap />
          {previewMode && <FlankLabel>SALE</FlankLabel>}
        </div>
      </Zone>

      <Zone label="USAGE" showLabel={previewMode}>
        <MiniReadout icon={usage.icon} value={usage.value} unit={usage.unit} />
      </Zone>

      <Zone label="SESSION" showLabel={previewMode}>
        <MiniReadout icon={session.icon} value={session.value} unit={session.unit} />
      </Zone>

      <Zone label="kWh DELIVERED" showLabel={previewMode}>
        <OdometerDial value={sessionKwh} digits={3} decimals={1} size="large" hasDCap />
      </Zone>

      <Zone label="PRICE PER kWh" showLabel={previewMode}>
        <div className="flex items-center gap-2">
          {previewMode && <FlankLabel small>$</FlankLabel>}
          <OdometerDial value={ratePerKwh} digits={1} decimals={2} size="small" />
        </div>
      </Zone>

      {previewMode && (
        <div className="absolute bottom-2 left-2 text-xs text-neutral-500">
          state: {state?.state ?? '—'} · conn: {connection} · brightness: {brightness.toFixed(2)}
        </div>
      )}
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

function Zone({
  label,
  showLabel,
  children,
}: {
  label: string;
  showLabel: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={showLabel ? 'px-12 py-4 border-b border-neutral-900' : 'px-12 py-4'}>
      {showLabel && (
        <div className="text-neutral-500 text-xs uppercase tracking-widest">{label}</div>
      )}
      <div className={showLabel ? 'mt-2 flex items-center justify-center' : 'flex items-center justify-center'}>
        {children}
      </div>
    </div>
  );
}

function FlankLabel({ children, small = false }: { children: React.ReactNode; small?: boolean }) {
  // Rendered only in `?preview=true` mode — on the real pump these are vinyl
  // stickers on the faceplate, not pixels.
  const sizeCls = small ? 'text-3xl' : 'text-5xl';
  return (
    <span className={`font-odometer font-black ${sizeCls}`} style={{ color: '#f8f3e1' }}>
      {children}
    </span>
  );
}
