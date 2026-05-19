import { create } from "zustand";

import type { DroMapFeature } from "@/lib/dromap/feature";

type EditorTestFeaturesState = {
  features: DroMapFeature[];
  addFeature: (feature: DroMapFeature) => void;
  updateFeature: (id: string, feature: DroMapFeature) => void;
  removeFeature: (id: string) => void;
  clearFeatures: () => void;
};

export const useEditorTestFeaturesStore = create<EditorTestFeaturesState>(
  (set) => ({
    features: [],

    addFeature: (feature) =>
      set((state) => ({
        features: [...state.features, feature],
      })),

    updateFeature: (id, feature) =>
      set((state) => ({
        features: state.features.map((f) => (f.id === id ? feature : f)),
      })),

    removeFeature: (id) =>
      set((state) => ({
        features: state.features.filter((f) => f.id !== id),
      })),

    clearFeatures: () => set({ features: [] }),
  }),
);
