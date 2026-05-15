import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SettingsSaveError, useAdminSettings } from '../../hooks/useAdminSettings';
import { useDirtyGuard } from '../../hooks/useDirtyGuard';
import SettingsGeneralTab from './settings/SettingsGeneralTab';
import SettingsHardwareTab from './settings/SettingsHardwareTab';
import SettingsRateTab from './settings/SettingsRateTab';
import SettingsSessionTab from './settings/SettingsSessionTab';
import SettingsLifetimeTab from './settings/SettingsLifetimeTab';

const LIFETIME_OFFSET_KEY = 'lifetime.offset_wh';
import type { SettingsDraft } from '../../types/AdminSettings';

// Tab switching within the Settings page is intentionally non-destructive —
// all tabs read/write the same shared draft, so the dirty-guard only fires on
// external navigation (Dashboard, Sessions, Logout) via the AdminShell.

type TabKey = 'general' | 'hardware' | 'rate' | 'session' | 'lifetime' | 'account' | 'backup';

interface TabSpec {
  key: TabKey;
  label: string;
  active: boolean;
  note?: string;
}

const TABS: TabSpec[] = [
  { key: 'general', label: 'General', active: true },
  { key: 'hardware', label: 'Hardware', active: true },
  { key: 'rate', label: 'Rate', active: true },
  { key: 'session', label: 'Session', active: true },
  { key: 'lifetime', label: 'Lifetime', active: true },
  { key: 'account', label: 'Account', active: false, note: 'Coming next' },
  { key: 'backup', label: 'Backup', active: false, note: 'Coming in Phase 8' },
];

export default function AdminSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { serverValues, loading, error, save } = useAdminSettings();

  const tabParam = searchParams.get('tab') as TabKey | null;
  const activeTab: TabKey = TABS.some((t) => t.key === tabParam && t.active)
    ? (tabParam as TabKey)
    : 'general';

  // Local working copy of settings. Starts empty, hydrates from serverValues
  // once the GET returns. Each tab mutates this via `update(key, value)`.
  const [draft, setDraft] = useState<SettingsDraft>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Hydrate the draft once server values arrive (and re-sync after a save).
  useEffect(() => {
    setDraft(serverValues);
  }, [serverValues]);

  const dirty = useMemo(() => {
    for (const k of Object.keys(draft)) {
      if ((draft[k] ?? '') !== (serverValues[k] ?? '')) return true;
    }
    for (const k of Object.keys(serverValues)) {
      if (!(k in draft)) return true;
    }
    return false;
  }, [draft, serverValues]);

  const update = useCallback((key: string, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setFieldErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }, []);

  const changedKeys = useMemo(() => {
    const out: SettingsDraft = {};
    for (const k of Object.keys(draft)) {
      if ((draft[k] ?? '') !== (serverValues[k] ?? '')) out[k] = draft[k] ?? '';
    }
    return out;
  }, [draft, serverValues]);

  const cancel = useCallback(() => {
    setDraft(serverValues);
    setFieldErrors({});
    setSavingState('idle');
  }, [serverValues]);

  const [lifetimeModalOpen, setLifetimeModalOpen] = useState(false);

  const performSave = useCallback(async (reason?: string) => {
    if (Object.keys(changedKeys).length === 0) return;
    setSavingState('saving');
    setFieldErrors({});
    try {
      await save(changedKeys, reason);
      setSavingState('saved');
      window.setTimeout(() => setSavingState('idle'), 2000);
    } catch (e) {
      if (e instanceof SettingsSaveError) {
        const errs: Record<string, string> = {};
        for (const err of e.errors) errs[err.key] = err.error;
        setFieldErrors(errs);
      }
      setSavingState('error');
    }
  }, [changedKeys, save]);

  const doSave = useCallback(() => {
    // Lifetime offset changes are gated behind a confirmation + reason modal
    // because they directly change the kiosk's lifetime-energy total.
    if (LIFETIME_OFFSET_KEY in changedKeys) {
      setLifetimeModalOpen(true);
      return;
    }
    void performSave();
  }, [changedKeys, performSave]);

  useDirtyGuard(dirty);

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading settings…</p>;
  }
  if (error) {
    return <p className="text-sm text-red-400" role="alert">Failed to load settings: {error}</p>;
  }

  return (
    <div className="space-y-4 pb-24">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-neutral-300">Settings</h2>
        {dirty && (
          <span className="text-xs text-amber-300/80">Unsaved changes</span>
        )}
      </header>

      <nav
        className="flex flex-wrap gap-1 border-b border-neutral-800"
        aria-label="Settings sections"
      >
        {TABS.map((tab) => {
          const isActiveTab = activeTab === tab.key;
          if (!tab.active) {
            return (
              <span
                key={tab.key}
                aria-disabled="true"
                title={tab.note ?? 'Coming soon'}
                className="px-3 py-2 text-sm text-neutral-600 cursor-not-allowed select-none"
              >
                {tab.label}
              </span>
            );
          }
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSearchParams({ tab: tab.key }, { replace: true })}
              className={`px-3 py-2 text-sm border-b-2 ${
                isActiveTab
                  ? 'border-amber-400 text-amber-200'
                  : 'border-transparent text-neutral-300 hover:text-neutral-100'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      <section>
        {activeTab === 'general' && (
          <SettingsGeneralTab values={draft} fieldErrors={fieldErrors} onChange={update} />
        )}
        {activeTab === 'hardware' && (
          <SettingsHardwareTab values={draft} fieldErrors={fieldErrors} onChange={update} />
        )}
        {activeTab === 'rate' && (
          <SettingsRateTab values={draft} fieldErrors={fieldErrors} onChange={update} />
        )}
        {activeTab === 'session' && (
          <SettingsSessionTab values={draft} fieldErrors={fieldErrors} onChange={update} />
        )}
        {activeTab === 'lifetime' && (
          <SettingsLifetimeTab values={draft} fieldErrors={fieldErrors} onChange={update} />
        )}
      </section>

      <SaveBar
        dirty={dirty}
        savingState={savingState}
        changedCount={Object.keys(changedKeys).length}
        onSave={doSave}
        onCancel={cancel}
      />

      {lifetimeModalOpen && (
        <LifetimeReasonModal
          oldWh={Number(serverValues[LIFETIME_OFFSET_KEY] ?? '0')}
          newWh={Number(draft[LIFETIME_OFFSET_KEY] ?? '0')}
          onCancel={() => setLifetimeModalOpen(false)}
          onConfirm={(reason) => {
            setLifetimeModalOpen(false);
            void performSave(reason);
          }}
        />
      )}
    </div>
  );
}

function LifetimeReasonModal({
  oldWh,
  newWh,
  onCancel,
  onConfirm,
}: {
  oldWh: number;
  newWh: number;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const oldKwh = (oldWh / 1000).toFixed(1);
  const newKwh = (newWh / 1000).toFixed(1);
  const canConfirm = reason.trim().length > 0;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm lifetime offset change"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="max-w-md w-full bg-neutral-900 border border-neutral-700 rounded-lg p-5 shadow-xl">
        <h3 className="text-base font-semibold text-neutral-100">Confirm lifetime offset change</h3>
        <p className="mt-2 text-sm text-neutral-300">
          You are adjusting the lifetime offset from <span className="tabular-nums">{oldKwh}</span> kWh
          to <span className="tabular-nums">{newKwh}</span> kWh. This will change the displayed
          lifetime energy total on the kiosk.
        </p>
        <label className="block mt-4">
          <span className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
            Reason for adjustment
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            autoFocus
            placeholder="e.g. Adjustment to account for energy delivered before software installation"
            className="w-full bg-neutral-950 border border-neutral-700 rounded px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-amber-400"
          />
        </label>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded border border-neutral-600 text-neutral-200 hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(reason.trim())}
            className="px-3 py-2 text-xs rounded bg-amber-400 text-neutral-900 font-medium hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirm adjustment
          </button>
        </div>
      </div>
    </div>
  );
}

function SaveBar({
  dirty,
  savingState,
  changedCount,
  onSave,
  onCancel,
}: {
  dirty: boolean;
  savingState: 'idle' | 'saving' | 'saved' | 'error';
  changedCount: number;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (!dirty && savingState !== 'saved') return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 bg-neutral-900 border-t border-neutral-700 shadow-lg">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between text-sm">
        <span className="text-neutral-400">
          {savingState === 'saving' && 'Saving…'}
          {savingState === 'saved' && <span className="text-emerald-400">Saved</span>}
          {savingState === 'error' && <span className="text-red-400" role="alert">Some changes could not be saved.</span>}
          {savingState === 'idle' && (
            <>
              {changedCount} {changedCount === 1 ? 'change' : 'changes'} pending
            </>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={!dirty || savingState === 'saving'}
            className="px-3 py-1.5 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || savingState === 'saving'}
            className="px-4 py-1.5 rounded bg-amber-400 text-neutral-900 font-medium hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

