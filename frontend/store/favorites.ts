import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SearchResult } from '@/types/train';
import { FavoriteRecord } from '@/types/journey';

interface FavoritesState {
  favorites: SearchResult[];
  setFavorites: (records: FavoriteRecord[]) => void;
  addFavorite: (train: SearchResult) => void;
  removeFavorite: (trainId: string) => void;
  isFavorite: (trainId: string) => boolean;
  toggleFavorite: (train: SearchResult) => void;
}

/**
 * In-memory (persisted) mirror of the user's favorites. MongoDB is the source
 * of truth — this store is only an optimistic cache for the UI.
 */
export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      favorites: [],
      setFavorites: (records) =>
        set({
          favorites: records.map((f) => ({
            id: f.trainNumber,
            number: f.trainNumber,
            name: f.trainName,
            origin: f.origin || { code: '', name: '' },
            destination: f.destination || { code: '', name: '' },
          })),
        }),
      addFavorite: (train) =>
        set((state) => ({
          favorites: state.favorites.some((f) => f.id === train.id || f.number === train.number)
            ? state.favorites
            : [train, ...state.favorites],
        })),
      removeFavorite: (trainId) =>
        set((state) => ({
          favorites: state.favorites.filter(
            (f) => f.id !== trainId && f.number !== trainId
          ),
        })),
      isFavorite: (trainId) =>
        get().favorites.some((f) => f.id === trainId || f.number === trainId),
      toggleFavorite: (train) => {
        const isFav = get().isFavorite(train.id || train.number);
        if (isFav) get().removeFavorite(train.id || train.number);
        else get().addFavorite(train);
      },
    }),
    { name: 'railgaadi-favorites' }
  )
);
