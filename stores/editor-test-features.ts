import { create } from "zustand";

import type { DroMapFeature } from "@/lib/dromap/feature";
import {
  ensureFeatureVisualReferenceZoom,
  getCurrentEditorMapZoom,
} from "@/lib/dromap/feature-visual-scale";
import type { DroMapFeatureDrawOrderAction } from "@/lib/dromap/feature-order";
import {
  normalizeFeatureDrawOrdersForPersistence,
  reorderFeatureDrawOrder,
} from "@/lib/dromap/feature-order";
import {
  captureWorkspaceHistorySnapshot,
  registerEditorHistoryCommit,
  restoreWorkspaceHistorySnapshot,
  type EditorWorkspaceHistorySnapshot,
} from "@/stores/editor-test-history-coordinator";
import {
  assignFeatureToActiveLayer,
  ensureFeatureHasLayerId,
  useEditorTestLayersStore,
} from "@/stores/editor-test-layers";

const MAX_FEATURE_HISTORY_ENTRIES = 75;

type EditorHistorySnapshot = {
  features: DroMapFeature[];
  workspace: EditorWorkspaceHistorySnapshot | null;
};

type EditorTestFeaturesState = {
  features: DroMapFeature[];
  addFeature: (feature: DroMapFeature) => void;
  updateFeature: (id: string, feature: DroMapFeature) => void;
  updateFeatures: (
    featureIds: string[],
    updater: (feature: DroMapFeature) => DroMapFeature,
  ) => void;
  removeFeature: (id: string) => void;
  removeFeatureWithHistory: (featureId: string) => void;
  removeFeaturesWithHistory: (featureIds: string[]) => void;
  clearFeatures: () => void;
  addFeatureWithHistory: (feature: DroMapFeature) => void;
  addFeaturesWithHistory: (features: DroMapFeature[]) => void;
  replaceFeatures: (features: DroMapFeature[]) => void;
  reorderFeatureWithHistory: (
    featureId: string,
    action: DroMapFeatureDrawOrderAction,
  ) => void;

  past: EditorHistorySnapshot[];
  future: EditorHistorySnapshot[];

  undo: () => void;
  redo: () => void;

  updateFeatureWithHistory: (
    featureId: string,
    updater: (feature: DroMapFeature) => DroMapFeature,
  ) => void;
  updateFeaturesWithHistory: (
    featureIds: string[],
    updater: (feature: DroMapFeature) => DroMapFeature,
  ) => void;

  commitFeaturesHistory: () => void;
};

function cloneFeatures(features: DroMapFeature[]) {
  return structuredClone(features);
}

function createHistorySnapshot(
  features: DroMapFeature[],
): EditorHistorySnapshot {
  return {
    features: cloneFeatures(features),
    workspace: captureWorkspaceHistorySnapshot(),
  };
}

function cloneHistorySnapshot(
  snapshot: EditorHistorySnapshot,
): EditorHistorySnapshot {
  return {
    features: cloneFeatures(snapshot.features),
    workspace: snapshot.workspace ? structuredClone(snapshot.workspace) : null,
  };
}

function normalizeFeaturesForStore(features: DroMapFeature[]) {
  const normalizedFeatures = normalizeFeatureDrawOrdersForPersistence(
    features,
  ).map((feature) =>
    ensureFeatureHasLayerId(
      ensureFeatureVisualReferenceZoom(feature, getCurrentEditorMapZoom()),
    ),
  );

  useEditorTestLayersStore.getState().syncLayersForFeatures(normalizedFeatures);

  return normalizedFeatures;
}

function normalizeNewFeatureForStore(feature: DroMapFeature) {
  const referencedFeature = ensureFeatureVisualReferenceZoom(
    feature,
    getCurrentEditorMapZoom(),
  );
  const nextFeature =
    typeof referencedFeature.properties.layerId === "string" &&
    referencedFeature.properties.layerId.trim()
      ? ensureFeatureHasLayerId(referencedFeature)
      : assignFeatureToActiveLayer(referencedFeature);
  useEditorTestLayersStore.getState().syncLayersForFeatures([nextFeature]);

  return nextFeature;
}

function appendHistory(
  past: EditorHistorySnapshot[],
  features: DroMapFeature[],
) {
  return [...past, createHistorySnapshot(features)].slice(
    -MAX_FEATURE_HISTORY_ENTRIES,
  );
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
          past: appendHistory(state.past, state.features),
          future: [],
        };
      }),

    updateFeatureWithHistory: (featureId, updater) =>
      set((state) => {
        const nextFeatures = state.features.map((feature) =>
          feature.id === featureId
            ? ensureFeatureHasLayerId(
                updater(feature),
                feature.properties.layerId,
              )
            : feature,
        );

        return {
          features: normalizeFeaturesForStore(nextFeatures),
          past: appendHistory(state.past, state.features),
          future: [],
        };
      }),

    updateFeaturesWithHistory: (featureIds, updater) =>
      set((state) => {
        const featureIdSet = new Set(featureIds);

        if (featureIdSet.size === 0) {
          return state;
        }

        let hasChanged = false;
        const nextFeatures = state.features.map((feature) => {
          if (!featureIdSet.has(feature.id)) {
            return feature;
          }

          const nextFeature = ensureFeatureHasLayerId(
            updater(feature),
            feature.properties.layerId,
          );
          hasChanged = hasChanged || nextFeature !== feature;
          return nextFeature;
        });

        if (!hasChanged) {
          return state;
        }

        return {
          features: normalizeFeaturesForStore(nextFeatures),
          past: appendHistory(state.past, state.features),
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
        past: appendHistory(state.past, state.features),
        future: [],
      })),

    undo: () =>
      set((state) => {
        if (state.past.length === 0) {
          return state;
        }

        const previousSnapshot =
          state.past[state.past.length - 1] ?? createHistorySnapshot([]);
        const previousFeatures = normalizeFeaturesForStore(
          previousSnapshot.features,
        );
        const newPast = state.past.slice(0, -1);
        const currentSnapshot = createHistorySnapshot(state.features);

        restoreWorkspaceHistorySnapshot(previousSnapshot.workspace);

        return {
          features: previousFeatures,
          past: newPast,
          future: [currentSnapshot, ...state.future]
            .slice(0, MAX_FEATURE_HISTORY_ENTRIES)
            .map(cloneHistorySnapshot),
        };
      }),

    redo: () =>
      set((state) => {
        if (state.future.length === 0) {
          return state;
        }

        const nextSnapshot = state.future[0] ?? createHistorySnapshot([]);
        const nextFeatures = normalizeFeaturesForStore(nextSnapshot.features);
        const newFuture = state.future.slice(1);
        const currentSnapshot = createHistorySnapshot(state.features);

        restoreWorkspaceHistorySnapshot(nextSnapshot.workspace);

        return {
          features: nextFeatures,
          past: [...state.past, currentSnapshot]
            .slice(-MAX_FEATURE_HISTORY_ENTRIES)
            .map(cloneHistorySnapshot),
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
        past: appendHistory(state.past, state.features),
        future: [],
      })),

    addFeaturesWithHistory: (features) =>
      set((state) => {
        if (features.length === 0) {
          return state;
        }

        const normalizedFeatures = features.map((feature) =>
          normalizeNewFeatureForStore(feature),
        );

        return {
          features: normalizeFeaturesForStore([
            ...state.features,
            ...normalizedFeatures,
          ]),
          past: appendHistory(state.past, state.features),
          future: [],
        };
      }),

    updateFeature: (id, feature) =>
      set((state) => ({
        features: normalizeFeaturesForStore(
          state.features.map((f) =>
            f.id === id
              ? ensureFeatureHasLayerId(feature, f.properties.layerId)
              : f,
          ),
        ),
      })),

    updateFeatures: (featureIds, updater) =>
      set((state) => {
        const featureIdSet = new Set(featureIds);

        if (featureIdSet.size === 0) {
          return state;
        }

        let hasChanged = false;
        const nextFeatures = state.features.map((feature) => {
          if (!featureIdSet.has(feature.id)) {
            return feature;
          }

          const nextFeature = ensureFeatureHasLayerId(
            updater(feature),
            feature.properties.layerId,
          );
          hasChanged = hasChanged || nextFeature !== feature;
          return nextFeature;
        });

        return hasChanged
          ? { features: normalizeFeaturesForStore(nextFeatures) }
          : state;
      }),

    removeFeature: (id) =>
      set((state) => ({
        features: state.features.filter((f) => f.id !== id),
      })),

    removeFeatureWithHistory: (featureId) =>
      set((state) => ({
        features: state.features.filter((feature) => feature.id !== featureId),
        past: appendHistory(state.past, state.features),
        future: [],
      })),

    removeFeaturesWithHistory: (featureIds) =>
      set((state) => {
        const featureIdSet = new Set(featureIds);
        const nextFeatures = state.features.filter(
          (feature) => !featureIdSet.has(feature.id),
        );

        if (nextFeatures.length === state.features.length) {
          return state;
        }

        return {
          features: nextFeatures,
          past: appendHistory(state.past, state.features),
          future: [],
        };
      }),

    clearFeatures: () => set({ features: [] }),
  }),
);

registerEditorHistoryCommit(() => {
  useEditorTestFeaturesStore.getState().commitFeaturesHistory();
});
