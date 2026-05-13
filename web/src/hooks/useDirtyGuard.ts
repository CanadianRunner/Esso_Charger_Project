import { createContext, useContext, useEffect, useMemo, useRef } from 'react';

/**
 * Cross-component dirty-state communication. The Settings page registers its
 * dirty flag here so the AdminShell's nav links can prompt before discarding
 * unsaved changes.
 *
 * Uses a ref-based reader (not React state) so the nav-link click handler
 * sees the latest value synchronously, even on the first render of the
 * Settings page.
 */
interface DirtyContextValue {
  get: () => boolean;
  set: (dirty: boolean) => void;
}

const noop: DirtyContextValue = { get: () => false, set: () => undefined };

export const DirtyContext = createContext<DirtyContextValue>(noop);

export function useDirtyProvider(): DirtyContextValue {
  const ref = useRef(false);
  return useMemo<DirtyContextValue>(
    () => ({
      get: () => ref.current,
      set: (d) => {
        ref.current = d;
      },
    }),
    [],
  );
}

/**
 * Mark the current page as dirty / clean. While dirty, install a
 * `beforeunload` listener so tab close / refresh shows the browser's native
 * confirmation. The AdminShell nav-link click handler also reads from the
 * shared context to gate in-app navigation with a confirm dialog.
 */
export function useDirtyGuard(isDirty: boolean) {
  const ctx = useContext(DirtyContext);

  useEffect(() => {
    ctx.set(isDirty);
    return () => ctx.set(false);
  }, [isDirty, ctx]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);
}

/**
 * Returns an onClick handler that prompts before navigating away when a
 * registered child has marked itself dirty. Mount this on every in-app
 * nav-link / button in the AdminShell so the guard fires before the route
 * changes.
 */
export function useDirtyGuardedNav(): (e: React.MouseEvent) => void {
  const ctx = useContext(DirtyContext);
  return (e: React.MouseEvent) => {
    if (!ctx.get()) return;
    const ok = window.confirm('You have unsaved changes. Discard them?');
    if (!ok) e.preventDefault();
    else ctx.set(false);
  };
}
