import { create } from 'zustand';
import type { PumpState } from '../types/PumpState';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

interface PumpStoreShape {
  state: PumpState | null;
  receivedAt: number | null;
  connection: ConnectionStatus;
  setState: (s: PumpState) => void;
  setConnection: (c: ConnectionStatus) => void;
}

export const usePumpStore = create<PumpStoreShape>((set) => ({
  state: null,
  receivedAt: null,
  connection: 'connecting',
  setState: (s) => set({ state: s, receivedAt: Date.now() }),
  setConnection: (c) => set({ connection: c }),
}));
