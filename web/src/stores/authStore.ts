import { create } from 'zustand';

interface AuthState {
  /** True once the first /api/auth/status call has resolved. */
  loaded: boolean;
  /** True if an admin password has been set on the server. */
  hasPassword: boolean;
  /** True if the current cookie is authenticated. */
  authed: boolean;

  setStatus: (next: { hasPassword: boolean; authed: boolean }) => void;
  setAuthed: (authed: boolean) => void;
  setLoaded: (loaded: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  loaded: false,
  hasPassword: false,
  authed: false,
  setStatus: ({ hasPassword, authed }) => set({ loaded: true, hasPassword, authed }),
  setAuthed: (authed) => set({ authed }),
  setLoaded: (loaded) => set({ loaded }),
  reset: () => set({ loaded: false, hasPassword: false, authed: false }),
}));
