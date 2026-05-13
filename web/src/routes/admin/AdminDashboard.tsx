import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import PumpDisplayContent from '../../components/display/PumpDisplayContent';
import type { DashboardResponse } from '../../types/AdminDashboard';

const REFRESH_INTERVAL_MS = 60_000;
const KIOSK_WIDTH = 768;
const KIOSK_HEIGHT = 1024;

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/dashboard', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as DashboardResponse;
      if (mountedRef.current) {
        setData(body);
        setError(null);
      }
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchDashboard();
    const id = window.setInterval(fetchDashboard, REFRESH_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      window.clearInterval(id);
    };
  }, [fetchDashboard]);

  return (
    <div className="space-y-6">
      <section
        aria-label="Live pump display"
        className="bg-black rounded-lg overflow-hidden border border-neutral-800"
      >
        <ScaledKioskView>
          <PumpDisplayContent />
        </ScaledKioskView>
      </section>

      <section aria-label="Energy delivered" className="grid grid-cols-3 gap-3">
        <StatCard label="Today" value={data?.aggregates.todayKwh} unit="kWh" />
        <StatCard label="This month" value={data?.aggregates.thisMonthKwh} unit="kWh" />
        <StatCard label="This year" value={data?.aggregates.thisYearKwh} unit="kWh" />
      </section>

      <section aria-label="Recent sessions">
        <h2 className="text-sm font-semibold text-neutral-300 mb-2">Recent sessions</h2>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 overflow-hidden">
          {data === null ? (
            <p className="p-4 text-sm text-neutral-500">Loading…</p>
          ) : data.recentSessions.length === 0 ? (
            <p className="p-4 text-sm text-neutral-500">No sessions yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-neutral-950 text-neutral-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Started</th>
                  <th className="text-right px-4 py-2 font-medium">Duration</th>
                  <th className="text-right px-4 py-2 font-medium">Energy</th>
                  <th className="text-right px-4 py-2 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.recentSessions.map((s) => (
                  <tr key={s.id} className="border-t border-neutral-800">
                    <td className="px-4 py-2 text-neutral-200">
                      {formatStartedAt(s.startedAt)}
                      {s.isMerged && (
                        <span
                          className="ml-2 text-[10px] uppercase tracking-wider text-amber-400/80"
                          title="Multiple physical connections merged into one session"
                        >
                          merged
                        </span>
                      )}
                      {s.endedAt === null && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-emerald-400/80">
                          active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-200">
                      {formatDuration(s.durationSeconds)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-200">
                      {s.energyKwh.toFixed(2)} kWh
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-200">
                      {formatCost(s.costCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section aria-label="System health">
        <h2 className="text-sm font-semibold text-neutral-300 mb-2">System health</h2>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <HealthRow
            label="Controller"
            value={
              data === null
                ? '—'
                : data.health.controllerResponsive
                ? 'Responsive'
                : `Unresponsive (${data.health.consecutiveFailures} failures)`
            }
            tone={data?.health.controllerResponsive ? 'ok' : data ? 'warn' : 'muted'}
          />
          <HealthRow
            label="Last poll"
            value={data === null ? '—' : formatLastPoll(data.health.lastPollUtc)}
            tone="muted"
          />
          <HealthRow
            label="Vehicle connected"
            value={data === null ? '—' : data.health.vehicleConnected ? 'Yes' : 'No'}
            tone="muted"
          />
          <HealthRow
            label="Contactor"
            value={data === null ? '—' : data.health.contactorClosed ? 'Closed' : 'Open'}
            tone="muted"
          />
        </div>
        {error && (
          <p role="alert" className="mt-2 text-xs text-red-400">
            Dashboard refresh failed: {error}
          </p>
        )}
      </section>
    </div>
  );
}

/**
 * Wraps the fixed 768×1024 PumpDisplayContent in a container that uniformly
 * scales it down to fit the parent width on smaller viewports (e.g. phones).
 * Caps at scale=1 so it never enlarges on desktop. Wrapper height tracks the
 * scaled height so following sections aren't pushed down by the unscaled box.
 */
function ScaledKioskView({ children }: { children: React.ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(Math.min(1, w / KIOSK_WIDTH));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="w-full overflow-hidden flex justify-center"
      style={{ height: KIOSK_HEIGHT * scale }}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
          width: KIOSK_WIDTH,
          flex: 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function StatCard({ label, value, unit }: { label: string; value: number | undefined; unit: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl tabular-nums text-neutral-100">
        {value === undefined ? '—' : value.toFixed(2)}{' '}
        <span className="text-xs text-neutral-500 align-baseline">{unit}</span>
      </div>
    </div>
  );
}

function HealthRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'ok' | 'warn' | 'muted';
}) {
  const toneCls =
    tone === 'ok' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-neutral-200';
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-500">{label}</span>
      <span className={`tabular-nums ${toneCls}`}>{value}</span>
    </div>
  );
}

function formatStartedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(s: number): string {
  if (s <= 0) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatLastPoll(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  const ageS = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (ageS < 60) return `${ageS}s ago`;
  if (ageS < 3600) return `${Math.floor(ageS / 60)}m ago`;
  return d.toLocaleString();
}
