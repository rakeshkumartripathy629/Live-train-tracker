import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PnrState {
  recentPnrs: { pnr: string; trainName: string; trainNumber: string; checkedAt: number }[];
  addRecentPnr: (entry: { pnr: string; trainName: string; trainNumber: string }) => void;
  clearRecentPnrs: () => void;
}

export const usePnrStore = create<PnrState>()(
  persist(
    (set) => ({
      recentPnrs: [],
      addRecentPnr: (entry) =>
        set((state) => ({
          recentPnrs: [
            { ...entry, checkedAt: Date.now() },
            ...state.recentPnrs.filter((p) => p.pnr !== entry.pnr),
          ].slice(0, 8),
        })),
      clearRecentPnrs: () => set({ recentPnrs: [] }),
    }),
    { name: 'railgaadi-recent-pnr' }
  )
);
