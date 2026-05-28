import { create } from "zustand";

import type { DroMapFeature } from "@/lib/dromap/feature";

const MAX_FEATURE_HISTORY_ENTRIES = 75;

type EditorTestFeaturesState = {
  features: DroMapFeature[];
  addFeature: (feature: DroMapFeature) => void;
  updateFeature: (id: string, feature: DroMapFeature) => void;
  removeFeature: (id: string) => void;
  removeFeatureWithHistory: (featureId: string) => void;
  clearFeatures: () => void;
  addFeatureWithHistory: (feature: DroMapFeature) => void;
  replaceFeatures: (features: DroMapFeature[]) => void;

  past: DroMapFeature[][];
  future: DroMapFeature[][];

  

  undo: () => void;
  redo: () => void;

  updateFeatureWithHistory: (
    featureId: string,
    updater: (feature: DroMapFeature) => DroMapFeature
  ) => void;

  commitFeaturesHistory: () => void;


};


export const useEditorTestFeaturesStore = create<EditorTestFeaturesState>(
  (set) => ({
    features: [],
    past: [],
    future: [],

    updateFeatureWithHistory: (featureId, updater) =>
      set((state) => {
        const nextFeatures = state.features.map((feature) =>
          feature.id === featureId ? updater(feature) : feature
        );

        return {
          features: nextFeatures,
          past: [...state.past, structuredClone(state.features)].slice(
            -MAX_FEATURE_HISTORY_ENTRIES
          ),
          future: [],
        };
      }),

    replaceFeatures: (features) => {
      set({
        features: structuredClone(features),
        past: [],
        future: [],
      });
    },

    commitFeaturesHistory: () =>
      set((state) => ({
        past: [...state.past, structuredClone(state.features)].slice(
          -MAX_FEATURE_HISTORY_ENTRIES
        ),
        future: [],
      })),

    undo: () =>
      set((state) => {
        if (state.past.length === 0){
          return state;
        }
        const previousFeatures = state.past[state.past.length - 1];
        const newPast = state.past.slice(0, -1);

        return {
          features: previousFeatures,
          past: newPast,
          future: [structuredClone(state.features), ...state.future].slice(
            0,
            MAX_FEATURE_HISTORY_ENTRIES
          ),
        };
      }),

    redo: () =>
      set((state) => {
        if (state.future.length === 0){
          return state;
        }
        const nextFeatures = state.future[0];
        const newFuture = state.future.slice(1);

        return {
          features: nextFeatures,
          past: [...state.past, structuredClone(state.features)].slice(
            -MAX_FEATURE_HISTORY_ENTRIES
          ),
          future: newFuture,
        };
      }),

    addFeature: (feature) =>
      set((state) => ({
        features: [...state.features, feature],
      })),

    addFeatureWithHistory: (feature) =>
      set((state) => ({
        features: [...state.features, feature],
        past: [...state.past, structuredClone(state.features)].slice(
          -MAX_FEATURE_HISTORY_ENTRIES
        ),
        future: [],
      })),

    updateFeature: (id, feature) =>
      set((state) => ({
        features: state.features.map((f) => (f.id === id ? feature : f)),
      })),

    removeFeature: (id) =>
      set((state) => ({
        features: state.features.filter((f) => f.id !== id),
      })),

    removeFeatureWithHistory: (featureId) =>
      set((state) => ({
        features: state.features.filter((feature) => feature.id !== featureId),
        past: [...state.past, structuredClone(state.features)].slice(
          -MAX_FEATURE_HISTORY_ENTRIES
        ),
        future: [],
      })),

    clearFeatures: () => set({ features: [] }),
  }),
);
