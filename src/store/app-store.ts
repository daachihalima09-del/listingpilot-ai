import { create } from 'zustand';

interface AppState {
  isReviewMode: boolean;
  toggleReviewMode: () => void;
  setReviewMode: (value: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isReviewMode: false,
  toggleReviewMode: () => set((state) => ({ isReviewMode: !state.isReviewMode })),
  setReviewMode: (value) => set({ isReviewMode: value }),
}));
