import { useEffect } from 'react';
import { startPumpHub } from '../lib/pumpHubClient';
import { usePumpStore } from '../stores/pumpStore';
import { useStaleData } from '../hooks/useStaleData';
import { useRotatingIndex } from '../hooks/useRotatingIndex';
import { useBrightness } from '../hooks/useBrightness';
import { usePreviewMode } from '../hooks/usePreviewMode';
import { usePixelShifter } from '../hooks/usePixelShifter';
import { useDialExercise, EXERCISE_MULTIPLIERS } from '../hooks/useDialExercise';
import {
  usePostSessionLinger,
  getLingerSpeedOverride,
} from '../hooks/usePostSessionLinger';
import { OdometerDial, MiniReadout } from '../components/dials';
import type { MiniReadoutProps } from '../components/dials';
import KioskFrame from '../components/shared/KioskFrame';
import type { PumpState } from '../types/PumpState';
import {
  formatDecimal,
  formatInteger,
  formatHmsExact,
  formatCostUsd,
  READOUT_DONE,
  READOUT_READY,
} from '../lib/displayFormat';

export default function PumpDisplay() {
  const state = usePumpStore((s) => s.state);
  const receivedAt = usePumpStore((s) => s.receivedAt);
  const connection = usePumpStore((s) => s.connection);
  const isStale = useStaleData(receivedAt);
  const previewMode = usePreviewMode();
  const pixelShift = usePixelShifter();

  // Display config flows from backend settings via SignalR. Until the first
  // pumpState arrives the hooks fall back to their built-in defaults.
  const linger = usePostSessionLinger({
    state: state?.state,
    session: state?.session ?? null,
    brightSeconds: state?.display.postSessionBrightSeconds,
    dimSeconds: state?.display.postSessionDimSeconds,
    speedFactor: getLingerSpeedOverride(),
  });

  // Effective display state: during linger, pretend the pump is still in
  // `session_complete` so Zone 3 reads "✓ Done" and Zone 1/4 hold their values.
  const effectiveState = linger.isLingering ? 'session_complete' : state?.state;
  const stateBrightness = useBrightness(effectiveState);
  const brightness = linger.brightnessOverride ?? stateBrightness;
  const exerciseStep = useDialExercise(effectiveState, linger.isLingering);

  useEffect(() => {
    startPumpHub();
  }, []);

  const showWarning = isStale || connection === 'disconnected';

  // During linger, freeze the displayed session values to whatever was captured
  // when the vehicle unplugged. Zone 5 (rate) is never frozen.
  const actualDollars = (state?.session?.costCents ?? 0) / 100;
  const actualKwh = state?.session?.energyKwh ?? 0;
  const actualRate = (state?.rate.centsPerKwh ?? 0) / 100;

  const frozenDollars = linger.data ? linger.data.costCents / 100 : null;
  const frozenKwh = linger.data ? linger.data.energyKwh : null;

  // Override resolution order: dial exercise > linger freeze > live data.
  const sessionDollars =
    exerciseStep !== null ? exerciseStep * EXERCISE_MULTIPLIERS.zone1Dollars
    : frozenDollars !== null ? frozenDollars
    : actualDollars;
  const sessionKwh =
    exerciseStep !== null ? exerciseStep * EXERCISE_MULTIPLIERS.zone4Kwh
    : frozenKwh !== null ? frozenKwh
    : actualKwh;
  const ratePerKwh =
    exerciseStep !== null ? exerciseStep * EXERCISE_MULTIPLIERS.zone5Rate
    : actualRate;

  // For zone rotations, pass a synthesized state that reflects the linger.
  // The session-complete rotation reads duration via formatHmsExact, so the
  // captured linger duration needs to flow through here.
  const stateForRotations: PumpState | null = linger.isLingering && state
    ? {
        ...state,
        state: 'session_complete',
        session: {
          costCents: linger.data?.costCents ?? 0,
          energyKwh: linger.data?.energyKwh ?? 0,
          durationSeconds: linger.data?.durationSeconds ?? 0,
          liveKw: 0,
        },
      }
    : state;

  const rotationIntervalMs = (state?.display.miniRotationSeconds ?? 10) * 1000;
  const usageRotations = buildUsageRotations(stateForRotations);
  const usageIndex = useRotatingIndex(usageRotations.length, rotationIntervalMs);
  const usage = usageRotations[usageIndex];

  const sessionRotations = buildSessionRotations(stateForRotations);
  const sessionIndex = useRotatingIndex(sessionRotations.length, rotationIntervalMs);
  const session = sessionRotations[sessionIndex];

  // Opacity dips to 0 during fading_out so the data swap to zeros isn't a hard snap.
  const containerOpacity = linger.phase === 'fading_out' ? 0 : 1;

  return (
    <KioskFrame>
    <div
      className="bg-black text-white w-[768px] h-[1024px] mx-auto relative font-mono"
      style={{
        filter: `brightness(${brightness})`,
        transform: `translate(${pixelShift.x}px, ${pixelShift.y}px)`,
        opacity: containerOpacity,
        transition:
          'filter 1.2s ease-in-out, transform 200ms ease-in-out, opacity 600ms ease-in-out',
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
          {linger.isLingering && ` · linger: ${linger.phase}`}
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
  const costDollars = (state?.session?.costCents ?? 0) / 100;

  switch (state?.state) {
    case 'charging':
      return [{ icon: '⚡', value: formatDecimal(liveKw), unit: 'kW' }];
    case 'session_complete':
      // 10-second rotation through the four post-session stats. Used for both
      // the natural session-complete state and the post-unplug linger window
      // (the linger synthesizes state='session_complete' to share this rotation).
      return [
        { icon: '⏱️', value: formatHmsExact(durationSeconds), unit: '' },
        { icon: '🔋', value: formatDecimal(sessionKwh), unit: 'kWh' },
        { icon: '💵', value: formatCostUsd(costDollars), unit: 'USD' },
        { icon: '⚡', value: READOUT_DONE, unit: 'Done' },
      ];
    case 'plugged_not_charging':
      return [{ icon: '⚡', value: formatDecimal(0), unit: 'kW' }];
    case 'idle':
    default:
      // True idle (no session, post-linger-reset): show a single READY display
      // instead of rotating zeros that don't communicate anything.
      // [_] [⚡] [R] [E] [A] [D] [Y] [🔌]
      return [{ icon: ' ', value: READOUT_READY, unit: '' }];
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
