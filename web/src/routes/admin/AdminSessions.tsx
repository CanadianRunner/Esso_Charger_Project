import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAdminSessions } from '../../hooks/useAdminSessions';
import {
  DEFAULT_FILTERS,
  PAGE_SIZE,
  type SessionListFilters,
  type SessionSort,
  type SessionSummary,
} from '../../types/AdminSession';

const ACTIVE_PIN_SEPARATOR_TESTID = 'active-pin-separator';

const SORTABLE: { key: SessionSort; label: string }[] = [
  { key: 'started', label: 'Started' },
  { key: 'duration', label: 'Duration' },
  { key: 'energy', label: 'Energy' },
  { key: 'cost', label: 'Cost' },
];

export default function AdminSessions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);

  const paged = useAdminSessions(filters);

  // The backend floats active sessions to the top of every sort. When the user
  // hasn't explicitly filtered by active state, the first row (if active) is
  // visually pinned with a separator. When they've filtered (true OR false),
  // skip the pin treatment.
  const items = paged.data?.items ?? [];
  const firstIsActive = items.length > 0 && items[0].endedAt === null;
  const pinsActive = filters.active === null && firstIsActive;
  const activeSession = pinsActive ? items[0] : null;
  const otherItems = pinsActive ? items.slice(1) : items;

  const update = (patch: Partial<SessionListFilters>) => {
    // Any filter or sort change resets page to 1; explicit page changes win.
    const next: SessionListFilters = {
      ...filters,
      ...patch,
      page: patch.page ?? 1,
    };
    setSearchParams(serializeFilters(next), { replace: true });
  };

  const toggleSort = (key: SessionSort) => {
    if (filters.sort === key) {
      update({ dir: filters.dir === 'asc' ? 'desc' : 'asc' });
    } else {
      update({ sort: key, dir: 'desc' });
    }
  };

  const totalPages = paged.data
    ? Math.max(1, Math.ceil(paged.data.totalCount / PAGE_SIZE))
    : 1;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-300">Sessions</h2>
        {paged.data && (
          <span className="text-xs text-neutral-500">
            {paged.data.totalCount} {paged.data.totalCount === 1 ? 'session' : 'sessions'}
          </span>
        )}
      </header>

      <FilterBar filters={filters} onChange={update} />

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-950 text-neutral-500 text-xs uppercase tracking-wide">
            <tr>
              {SORTABLE.map(({ key, label }) => (
                <th
                  key={key}
                  className="text-left px-4 py-2 font-medium select-none cursor-pointer hover:text-neutral-300"
                  onClick={() => toggleSort(key)}
                >
                  {label}
                  {filters.sort === key && (
                    <span className="ml-1 text-amber-400">
                      {filters.dir === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
              ))}
              <th className="text-left px-4 py-2 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {activeSession && (
              <>
                <SessionRow
                  session={activeSession}
                  pinned
                  onClick={() => navigateToDetail(navigate, activeSession.id, searchParams)}
                />
                <tr aria-hidden data-testid={ACTIVE_PIN_SEPARATOR_TESTID}>
                  <td colSpan={5} className="p-0">
                    <div className="h-px bg-neutral-700/60" />
                  </td>
                </tr>
              </>
            )}

            {paged.loading && items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-neutral-500">Loading…</td></tr>
            ) : otherItems.length === 0 && !activeSession ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                No sessions match the current filters.
              </td></tr>
            ) : otherItems.length === 0 && activeSession ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                No other sessions match the current filters.
              </td></tr>
            ) : (
              otherItems.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  onClick={() => navigateToDetail(navigate, s.id, searchParams)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {paged.error && (
        <p role="alert" className="text-xs text-red-400">Failed to load sessions: {paged.error}</p>
      )}

      <Pagination
        page={filters.page}
        totalPages={totalPages}
        onChange={(page) => update({ page })}
      />
    </div>
  );
}

function FilterBar({
  filters,
  onChange,
}: {
  filters: SessionListFilters;
  onChange: (patch: Partial<SessionListFilters>) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-500">From</span>
        <input
          type="date"
          value={filters.from?.slice(0, 10) ?? ''}
          onChange={(e) => onChange({ from: e.target.value || null })}
          className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-neutral-200"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-500">To</span>
        <input
          type="date"
          value={filters.to?.slice(0, 10) ?? ''}
          onChange={(e) => onChange({ to: e.target.value || null })}
          className="bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-neutral-200"
        />
      </label>
      <label className="flex items-center gap-2 pb-1">
        <input
          type="checkbox"
          checked={filters.merged === true}
          onChange={(e) => onChange({ merged: e.target.checked ? true : null })}
        />
        <span className="text-neutral-300">Merged only</span>
      </label>
      <label className="flex items-center gap-2 pb-1">
        <input
          type="checkbox"
          checked={filters.active === true}
          onChange={(e) => onChange({ active: e.target.checked ? true : null })}
        />
        <span className="text-neutral-300">Active only</span>
      </label>
      {!isDefault(filters) && (
        <Link
          to="/admin/sessions"
          replace
          className="ml-auto text-xs text-neutral-400 hover:text-neutral-200 underline pb-1"
        >
          Clear filters
        </Link>
      )}
    </div>
  );
}

function SessionRow({
  session,
  pinned = false,
  onClick,
}: {
  session: SessionSummary;
  pinned?: boolean;
  onClick: () => void;
}) {
  const isActive = session.endedAt === null;
  return (
    <tr
      onClick={onClick}
      className={`border-t border-neutral-800 cursor-pointer hover:bg-neutral-800/40 ${
        pinned ? 'bg-emerald-950/20 hover:bg-emerald-950/30' : ''
      }`}
    >
      <td className="px-4 py-2 text-neutral-200">{formatStartedAt(session.startedAt)}</td>
      <td className="px-4 py-2 tabular-nums text-neutral-200">{formatDuration(session.durationSeconds)}</td>
      <td className="px-4 py-2 tabular-nums text-neutral-200">{session.energyKwh.toFixed(2)} kWh</td>
      <td className="px-4 py-2 tabular-nums text-neutral-200">{formatCost(session.costCents)}</td>
      <td className="px-4 py-2 text-xs">
        {isActive && (
          <span className="uppercase tracking-wider text-emerald-400">Active</span>
        )}
        {session.isMerged && (
          <span className="ml-2 uppercase tracking-wider text-amber-400/80">Merged</span>
        )}
      </td>
    </tr>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 text-sm">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1 rounded border border-neutral-700 text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-800"
      >
        Previous
      </button>
      <span className="text-xs text-neutral-500 tabular-nums px-2">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1 rounded border border-neutral-700 text-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-neutral-800"
      >
        Next
      </button>
    </div>
  );
}

function navigateToDetail(
  navigate: ReturnType<typeof useNavigate>,
  id: string,
  search: URLSearchParams,
) {
  // Forward the current filter querystring so the Sessions nav link on the
  // detail page can restore the list view with the same filters intact.
  const qs = search.toString();
  navigate(qs ? `/admin/sessions/${id}?${qs}` : `/admin/sessions/${id}`);
}

function parseFilters(params: URLSearchParams): SessionListFilters {
  const sort = (params.get('sort') ?? 'started') as SessionSort;
  const dir = (params.get('dir') === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);
  return {
    from: params.get('from') || null,
    to: params.get('to') || null,
    merged: parseBool(params.get('merged')),
    active: parseBool(params.get('active')),
    sort: ['started', 'duration', 'energy', 'cost'].includes(sort) ? sort : 'started',
    dir,
    page,
  };
}

function serializeFilters(f: SessionListFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (f.from) params.set('from', f.from);
  if (f.to) params.set('to', f.to);
  if (f.merged !== null) params.set('merged', String(f.merged));
  if (f.active !== null) params.set('active', String(f.active));
  if (f.sort !== DEFAULT_FILTERS.sort) params.set('sort', f.sort);
  if (f.dir !== DEFAULT_FILTERS.dir) params.set('dir', f.dir);
  if (f.page !== 1) params.set('page', String(f.page));
  return params;
}

function parseBool(v: string | null): boolean | null {
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

function isDefault(f: SessionListFilters): boolean {
  return (
    f.from === null &&
    f.to === null &&
    f.merged === null &&
    f.active === null &&
    f.sort === DEFAULT_FILTERS.sort &&
    f.dir === DEFAULT_FILTERS.dir &&
    f.page === 1
  );
}

function formatStartedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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
