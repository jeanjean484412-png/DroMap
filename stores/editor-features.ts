import { create } from "zustand";

import type { DroMapFeature } from "@/lib/dromap/feature";
import {
  ensureFeatureVisualReferenceZoom,
  getCurrentEditorMapZoom,
} from "@/lib/dromap/feature-visual-scale";
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";
import type { DroMapFeatureDrawOrderAction } from "@/lib/dromap/feature-order";
import {
  normalizeFeatureDrawOrdersForPersistence,
  reorderFeatureDrawOrder,
} from "@/lib/dromap/feature-order";
import {
  captureEditorHistoryParticipants,
  captureWorkspaceHistorySnapshot,
  isEditorHistoryRecordingEnabled,
  registerEditorHistoryCommit,
  restoreEditorHistoryParticipants,
  restoreWorkspaceHistorySnapshot,
  type EditorHistoryParticipantsSnapshot,
  type EditorWorkspaceHistorySnapshot,
} from "@/stores/editor-history-coordinator";
import {
  assignFeatureToActiveLayer,
  ensureFeatureHasLayerId,
  useEditorLayersStore,
} from "@/stores/editor-layers";

const MAX_FEATURE_HISTORY_ENTRIES = 75;

type EditorHistorySnapshot = {
  features: DroMapFeature[];
  workspace: EditorWorkspaceHistorySnapshot | null;
  participants: EditorHistoryParticipantsSnapshot | null;
};

type EditorFeaturesState = {
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
  replaceFeaturesWithHistory: (features: DroMapFeature[]) => void;
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

  commitFeaturesHistory: (options?: { includeParticipants?: boolean }) => void;
  resetHistory: () => void;
};

function cloneFeatures(features: DroMapFeature[]) {
  return structuredClone(features);
}

function createHistorySnapshot(
  features: DroMapFeature[],
  includeParticipants = false,
): EditorHistorySnapshot {
  return {
    features: cloneFeatures(features),
    workspace: captureWorkspaceHistorySnapshot(),
    participants: includeParticipants ? captureEditorHistoryParticipants() : null,
  };
}

function cloneHistorySnapshot(
  snapshot: EditorHistorySnapshot,
): EditorHistorySnapshot {
  return {
    features: cloneFeatures(snapshot.features),
    workspace: snapshot.workspace ? structuredClone(snapshot.workspace) : null,
    participants: snapshot.participants ? structuredClone(snapshot.participants) : null,
  };
}

function getFeatureCreationReferenceZoom() {
  const baseZoom =
    useEditorWorkspaceStore.getState().workspaceBasemapBaseZoom;

  return typeof baseZoom === "number" && Number.isFinite(baseZoom)
    ? baseZoom
    : getCurrentEditorMapZoom();
}

function normalizeFeaturesForStore(features: DroMapFeature[]) {
  const normalizedFeatures = normalizeFeatureDrawOrdersForPersistence(
    features,
  ).map((feature) =>
    ensureFeatureHasLayerId(
      ensureFeatureVisualReferenceZoom(feature, getFeatureCreationReferenceZoom()),
    ),
  );

  useEditorLayersStore.getState().syncLayersForFeatures(normalizedFeatures);

  return normalizedFeatures;
}

function normalizeNewFeatureForStore(feature: DroMapFeature) {
  const referencedFeature = ensureFeatureVisualReferenceZoom(
    feature,
    getFeatureCreationReferenceZoom(),
  );
  const nextFeature =
    typeof referencedFeature.properties.layerId === "string" &&
    referencedFeature.properties.layerId.trim()
      ? ensureFeatureHasLayerId(referencedFeature)
      : assignFeatureToActiveLayer(referencedFeature);
  useEditorLayersStore.getState().syncLayersForFeatures([nextFeature]);

  return nextFeature;
}

function appendHistory(
  past: EditorHistorySnapshot[],
  features: DroMapFeature[],
  includeParticipants = false,
) {
  if (!isEditorHistoryRecordingEnabled()) {
    return past;
  }
  return [...past, createHistorySnapshot(features, includeParticipants)].slice(
    -MAX_FEATURE_HISTORY_ENTRIES,
  );
}

export const useEditorFeaturesStore = create<EditorFeaturesState>(
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

    replaceFeaturesWithHistory: (features) =>
      set((state) => ({
        features: cloneFeatures(normalizeFeaturesForStore(features)),
        past: appendHistory(state.past, state.features),
        future: [],
      })),

    resetHistory: () => set({ past: [], future: [] }),

    commitFeaturesHistory: (options) =>
      set((state) => ({
        past: appendHistory(
          state.past,
          state.features,
          options?.includeParticipants === true,
        ),
        future: [],
      })),

    undo: () =>
      set((state) => {
        if (!isEditorHistoryRecordingEnabled() || state.past.length === 0) {
          return state;
        }

        const previousSnapshot =
          state.past[state.past.length - 1] ?? createHistorySnapshot([]);
        const newPast = state.past.slice(0, -1);
        const currentSnapshot = createHistorySnapshot(
          state.features,
          previousSnapshot.participants !== null,
        );

        restoreWorkspaceHistorySnapshot(previousSnapshot.workspace);
        if (previousSnapshot.participants) {
          restoreEditorHistoryParticipants(previousSnapshot.participants);
        }
        const previousFeatures = normalizeFeaturesForStore(
          previousSnapshot.features,
        );

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
        if (!isEditorHistoryRecordingEnabled() || state.future.length === 0) {
          return state;
        }

        const nextSnapshot = state.future[0] ?? createHistorySnapshot([]);
        const newFuture = state.future.slice(1);
        const currentSnapshot = createHistorySnapshot(
          state.features,
          nextSnapshot.participants !== null,
        );

        restoreWorkspaceHistorySnapshot(nextSnapshot.workspace);
        if (nextSnapshot.participants) {
          restoreEditorHistoryParticipants(nextSnapshot.participants);
        }
        const nextFeatures = normalizeFeaturesForStore(nextSnapshot.features);

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
  useEditorFeaturesStore.getState().commitFeaturesHistory();
});
