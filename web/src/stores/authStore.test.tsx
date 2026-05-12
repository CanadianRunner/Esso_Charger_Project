import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './authStore';

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ loaded: false, hasPassword: false, authed: false });
  });

  it('starts unloaded with no password and not authed', () => {
    const s = useAuthStore.getState();
    expect(s.loaded).toBe(false);
    expect(s.hasPassword).toBe(false);
    expect(s.authed).toBe(false);
  });

  it('setStatus flips loaded and applies hasPassword/authed', () => {
    useAuthStore.getState().setStatus({ hasPassword: true, authed: false });
    const s = useAuthStore.getState();
    expect(s.loaded).toBe(true);
    expect(s.hasPassword).toBe(true);
    expect(s.authed).toBe(false);
  });

  it('setAuthed toggles authed without touching other fields', () => {
    useAuthStore.getState().setStatus({ hasPassword: true, authed: false });
    useAuthStore.getState().setAuthed(true);
    const s = useAuthStore.getState();
    expect(s.authed).toBe(true);
    expect(s.hasPassword).toBe(true);
    expect(s.loaded).toBe(true);
  });

  it('reset clears everything back to defaults', () => {
    useAuthStore.getState().setStatus({ hasPassword: true, authed: true });
    useAuthStore.getState().reset();
    const s = useAuthStore.getState();
    expect(s.loaded).toBe(false);
    expect(s.hasPassword).toBe(false);
    expect(s.authed).toBe(false);
  });
});
