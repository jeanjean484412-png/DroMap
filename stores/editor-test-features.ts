import { create } from "zustand";

import type { DroMapFeature } from "@/lib/dromap/feature";
import type { DroMapFeatureDrawOrderAction } from "@/lib/dromap/feature-order";
import {
  normalizeFeatureDrawOrdersForPersistence,
  reorderFeatureDrawOrder,
} from "@/lib/dromap/feature-order";
import {
  assignFeatureToActiveLayer,
  ensureFeatureHasLayerId,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";

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
  reorderFeatureWithHistory: (
    featureId: string,
    action: DroMapFeatureDrawOrderAction,
  ) => void;

  past: DroMapFeature[][];
  future: DroMapFeature[][];

  undo: () => void;
  redo: () => void;

  updateFeatureWithHistory: (
    featureId: string,
    updater: (feature: DroMapFeature) => DroMapFeature,
  ) => void;

  commitFeaturesHistory: () => void;
};

function cloneFeatures(features: DroMapFeature[]) {
  return structuredClone(features);
}

function normalizeFeaturesForStore(features: DroMapFeature[]) {
  const normalizedFeatures = normalizeFeatureDrawOrdersForPersistence(features).map(
    (feature) => ensureFeatureHasLayerId(feature),
  );

  useEditorTestLayersStore.getState().syncLayersForFeatures(normalizedFeatures);

  return normalizedFeatures;
}

function normalizeNewFeatureForStore(feature: DroMapFeature) {
  const nextFeature =
    typeof feature.properties.layerId === "string" && feature.properties.layerId.trim()
      ? ensureFeatureHasLayerId(feature)
      : assignFeatureToActiveLayer(feature);
  useEditorTestLayersStore.getState().syncLayersForFeatures([nextFeature]);

  return nextFeature;
}

export const useEditorTestFeaturesStore = create<EditorTestFeaturesState>(
  (set) => ({
    features: [],
    past: [],
    future: [],

    reorderFeatureWithHistory: (featureId, action) =>
      set((state) => {
        const nextFeatures = reorderFeatureDrawOrder(
          state.features,
          featureId,
          action,
        );

        if (nextFeatures === state.features) {
          return state;
        }

        return {
          features: normalizeFeaturesForStore(nextFeatures),
          past: [...state.past, cloneFeatures(state.features)].slice(
            -MAX_FEATURE_HISTORY_ENTRIES,
          ),
          future: [],
        };
      }),

    updateFeatureWithHistory: (featureId, updater) =>
      set((state) => {
        const nextFeatures = state.features.map((feature) =>
          feature.id === featureId
            ? ensureFeatureHasLayerId(updater(feature), feature.properties.layerId)
            : feature,
        );

        return {
          features: normalizeFeaturesForStore(nextFeatures),
          past: [...state.past, cloneFeatures(state.features)].slice(
            -MAX_FEATURE_HISTORY_ENTRIES,
          ),
          future: [],
        };
      }),

    replaceFeatures: (features) => {
      set({
        features: cloneFeatures(normalizeFeaturesForStore(features)),
        past: [],
        future: [],
      });
    },

    commitFeaturesHistory: () =>
      set((state) => ({
        past: [...state.past, cloneFeatures(state.features)].slice(
          -MAX_FEATURE_HISTORY_ENTRIES,
        ),
        future: [],
      })),

    undo: () =>
      set((state) => {
        if (state.past.length === 0) {
          return state;
        }
        const previousFeatures = normalizeFeaturesForStore(
          state.past[state.past.length - 1] ?? [],
        );
        const newPast = state.past.slice(0, -1);

        return {
          features: previousFeatures,
          past: newPast,
          future: [cloneFeatures(state.features), ...state.future].slice(
            0,
            MAX_FEATURE_HISTORY_ENTRIES,
          ),
        };
      }),

    redo: () =>
      set((state) => {
        if (state.future.length === 0) {
          return state;
        }
        const nextFeatures = normalizeFeaturesForStore(state.future[0] ?? []);
        const newFuture = state.future.slice(1);

        return {
          features: nextFeatures,
          past: [...state.past, cloneFeatures(state.features)].slice(
            -MAX_FEATURE_HISTORY_ENTRIES,
          ),
          future: newFuture,
        };
      }),

    addFeature: (feature) =>
      set((state) => ({
        features: [...state.features, normalizeNewFeatureForStore(feature)],
      })),

    addFeatureWithHistory: (feature) =>
      set((state) => ({
        features: [...state.features, normalizeNewFeatureForStore(feature)],
        past: [...state.past, cloneFeatures(state.features)].slice(
          -MAX_FEATURE_HISTORY_ENTRIES,
        ),
        future: [],
      })),

    updateFeature: (id, feature) =>
      set((state) => ({
        features: normalizeFeaturesForStore(
          state.features.map((f) =>
            f.id === id ? ensureFeatureHasLayerId(feature, f.properties.layerId) : f,
          ),
        ),
      })),

    removeFeature: (id) =>
      set((state) => ({
        features: state.features.filter((f) => f.id !== id),
      })),

    removeFeatureWithHistory: (featureId) =>
      set((state) => ({
        features: state.features.filter((feature) => feature.id !== featureId),
        past: [...state.past, cloneFeatures(state.features)].slice(
          -MAX_FEATURE_HISTORY_ENTRIES,
        ),
        future: [],
      })),

    clearFeatures: () => set({ features: [] }),
  }),
);
