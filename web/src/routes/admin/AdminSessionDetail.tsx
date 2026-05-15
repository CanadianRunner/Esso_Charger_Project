import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PowerChart from '../../components/charts/PowerChart';
import { useAdminSession } from '../../hooks/useAdminSession';
import type { SessionDetail } from '../../types/AdminSession';

const NOTES_SAVE_DEBOUNCE_MS = 500;

export default function AdminSessionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { data, loading, error, patch, remove } = useAdminSession(id);

  const backToListHref = `/admin/sessions${searchParams.toString() ? `?${searchParams}` : ''}`;

  if (loading && !data) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }
  if (error && !data) {
    return (
      <div className="space-y-2">
        <Link to={backToListHref} className="text-sm text-amber-200 hover:underline">
          ← Back to sessions
        </Link>
        <p className="text-sm text-red-400" role="alert">Could not load session: {error}</p>
      </div>
    );
  }
  if (!data) return null;

  return (
    <SessionDetail
      session={data}
      backToListHref={backToListHref}
      onSaveNotes={(notes) => patch({ notes })}
      onToggleMerged={(isMerged) => patch({ isMerged })}
      onDelete={async () => {
        await remove();
        navigate(backToListHref, { replace: true });
      }}
    />
  );
}

interface DetailProps {
  session: SessionDetail;
  backToListHref: string;
  onSaveNotes: (notes: string) => Promise<unknown>;
  onToggleMerged: (isMerged: boolean) => Promise<unknown>;
  onDelete: () => Promise<unknown>;
}

function SessionDetail({ session, backToListHref, onSaveNotes, onToggleMerged, onDelete }: DetailProps) {
  const isActive = session.endedAt === null;

  return (
    <div className="space-y-5">
      <Link to={backToListHref} className="text-sm text-amber-200 hover:underline">
        ← Back to sessions
      </Link>

      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-base font-semibold text-neutral-200">
          {formatStartedAt(session.startedAt)}
        </h2>
        <span className="text-sm text-neutral-500">
          {isActive ? 'In progress' : `Ended ${formatStartedAt(session.endedAt!)}`}
        </span>
        {isActive && (
          <span className="text-xs uppercase tracking-wider text-emerald-400">Active</span>
        )}
        {session.isMerged && (
          <span className="text-xs uppercase tracking-wider text-amber-400/80">Merged</span>
        )}
      </header>

      <PowerChart samples={session.powerSamples} />

      <section aria-label="Session stats" className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Peak power" value={`${formatNumber(session.peakKw, 1)} kW`} />
        <Stat label="Energy" value={`${formatNumber(session.energyKwh, 2)} kWh`} />
        <Stat label="Cost" value={formatCost(session.costCents)} />
        <Stat label="Rate at start" value={`${formatNumber(session.rateAtStartCentsPerKwh / 100, 3)} $/kWh`} />
      </section>

      <NotesEditor initial={session.notes ?? ''} onSave={onSaveNotes} />

      <MergedToggle
        merged={session.isMerged}
        disabled={isActive}
        onChange={onToggleMerged}
      />

      <DeleteSection
        session={session}
        disabled={isActive}
        onDelete={onDelete}
      />
    </div>
  );
}

function NotesEditor({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (notes: string) => Promise<unknown>;
}) {
  const [value, setValue] = useState(initial);
  const [savedValue, setSavedValue] = useState(initial);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const debounceRef = useRef<number | undefined>();
  const fadeRef = useRef<number | undefined>();

  // Re-sync when the parent reloads the session with different notes. Skip the
  // mount-time run: useState already seeded value from initial, and a fast
  // user can type between mount-commit and post-commit effect, in which case
  // an unconditional setValue(initial) would erase their input.
  const lastInitialRef = useRef(initial);
  useEffect(() => {
    if (initial === lastInitialRef.current) return;
    lastInitialRef.current = initial;
    setValue(initial);
    setSavedValue(initial);
  }, [initial]);

  // Cancel pending timers on unmount so we don't update state on an unmounted
  // component (and the test runner doesn't trip on stray setState calls).
  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      if (fadeRef.current) window.clearTimeout(fadeRef.current);
    };
  }, []);

  const performSave = useCallback(async () => {
    if (value === savedValue) return;
    setSavingState('saving');
    try {
      await onSave(value);
      setSavedValue(value);
      setSavingState('saved');
      if (fadeRef.current) window.clearTimeout(fadeRef.current);
      fadeRef.current = window.setTimeout(() => setSavingState('idle'), 1500);
    } catch {
      setSavingState('error');
    }
  }, [value, savedValue, onSave]);

  const scheduleSave = useCallback(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(performSave, NOTES_SAVE_DEBOUNCE_MS);
  }, [performSave]);

  return (
    <section aria-label="Notes">
      <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
        Notes
        <span className="ml-2 text-[10px] normal-case tracking-normal text-neutral-600">
          ⌘/Ctrl + Enter to save
        </span>
      </label>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={scheduleSave}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            if (debounceRef.current) window.clearTimeout(debounceRef.current);
            performSave();
          }
        }}
        rows={3}
        className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-amber-400"
        placeholder="Add a note about this session…"
      />
      <div className="mt-1 text-xs h-4">
        {savingState === 'saving' && <span className="text-neutral-500">Saving…</span>}
        {savingState === 'saved' && <span className="text-emerald-400">Saved</span>}
        {savingState === 'error' && (
          <span className="text-red-400" role="alert">Save failed.</span>
        )}
      </div>
    </section>
  );
}

function MergedToggle({
  merged,
  disabled,
  onChange,
}: {
  merged: boolean;
  disabled: boolean;
  onChange: (next: boolean) => Promise<unknown>;
}) {
  const [saving, setSaving] = useState(false);
  const handleClick = async () => {
    if (disabled || saving) return;
    setSaving(true);
    try {
      await onChange(!merged);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section aria-label="Merged flag">
      <label
        className={`flex items-center gap-3 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        title={disabled ? 'Available after session ends.' : undefined}
      >
        <input
          type="checkbox"
          checked={merged}
          disabled={disabled || saving}
          onChange={handleClick}
          aria-describedby={disabled ? 'merged-disabled-reason' : undefined}
        />
        <span className="text-sm text-neutral-300">
          Merged with prior session
        </span>
      </label>
      {disabled && (
        <p id="merged-disabled-reason" className="text-xs text-neutral-500 mt-1">
          Available after session ends.
        </p>
      )}
    </section>
  );
}

function DeleteSection({
  session,
  disabled,
  onDelete,
}: {
  session: SessionDetail;
  disabled: boolean;
  onDelete: () => Promise<unknown>;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <section aria-label="Delete session" className="pt-4 border-t border-neutral-800">
      <button
        type="button"
        onClick={() => {
          setError(null);
          setModalOpen(true);
        }}
        disabled={disabled}
        title={disabled ? 'End the session before deleting.' : undefined}
        className="px-3 py-1.5 text-sm rounded border border-red-900 text-red-400 hover:bg-red-950/40 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Delete session
      </button>
      {disabled && (
        <p className="text-xs text-neutral-500 mt-1">End the session before deleting.</p>
      )}
      {modalOpen && (
        <DeleteModal
          session={session}
          error={error}
          onCancel={() => setModalOpen(false)}
          onConfirm={async () => {
            setError(null);
            try {
              await onDelete();
              setModalOpen(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Delete failed.');
            }
          }}
        />
      )}
    </section>
  );
}

function DeleteModal({
  session,
  error,
  onCancel,
  onConfirm,
}: {
  session: SessionDetail;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm delete"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="max-w-md w-full bg-neutral-900 border border-neutral-700 rounded-lg p-5 shadow-xl">
        <h3 className="text-base font-semibold text-neutral-100">Delete session?</h3>
        <p className="mt-2 text-sm text-neutral-300">
          Delete session from {formatStartedAt(session.startedAt)}? {formatNumber(session.energyKwh, 1)} kWh,{' '}
          {formatCost(session.costCents)}. This cannot be undone.
        </p>
        {error && <p className="mt-2 text-xs text-red-400" role="alert">{error}</p>}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded border border-neutral-600 text-neutral-200 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-2 text-xs rounded bg-red-700 text-red-50 hover:bg-red-600"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-lg tabular-nums text-neutral-100">{value}</div>
    </div>
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

function formatNumber(v: number, decimals: number): string {
  return v.toFixed(decimals);
}

function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
