import { create } from "zustand";

import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";

type SelectFeatureOptions = {
  focusOnMap?: boolean;
};

type SelectionRequest = {
  featureId: string;
  requestId: number;
};

type WorkspaceRecenterRequest = {
  requestId: number;
};

type MapBoundsFitRequest = {
  bounds: WorkspaceBounds;
  requestId: number;
  maxZoom?: number;
  animate?: boolean;
};

type MapBoundsFitOptions = {
  maxZoom?: number;
  animate?: boolean;
};

type EditorTestSelectionState = {
  /** Objet principal : il conserve les poignées d'édition et les actions unitaires. */
  selectedFeatureId: string | null;
  /** Ensemble complet utilisé par la sélection multiple et les modifications groupées. */
  selectedFeatureIds: string[];
  multiSelectionEnabled: boolean;
  focusedSelectionRequest: SelectionRequest | null;
  workspaceRecenterRequest: WorkspaceRecenterRequest | null;
  mapBoundsFitRequest: MapBoundsFitRequest | null;
  objectsPanelRequest: SelectionRequest | null;
  selectedFromObjectsPanel: boolean;
  setSelectedFeatureId: (
    featureId: string | null,
    options?: SelectFeatureOptions,
  ) => void;
  setSelectedFeatureIds: (featureIds: string[]) => void;
  toggleFeatureSelection: (
    featureId: string,
    options?: SelectFeatureOptions,
  ) => void;
  setMultiSelectionEnabled: (enabled: boolean) => void;
  clearSelectedFeatureId: () => void;
  requestMapFitToBounds: (
    bounds: WorkspaceBounds,
    options?: MapBoundsFitOptions,
  ) => void;
  requestOpenFeatureInObjectsPanel: (featureId: string) => void;
};

function uniqueFeatureIds(featureIds: string[]) {
  return Array.from(
    new Set(featureIds.map((featureId) => featureId.trim()).filter(Boolean)),
  );
}

export const useEditorTestSelectionStore = create<EditorTestSelectionState>(
  (set) => ({
    selectedFeatureId: null,
    selectedFeatureIds: [],
    multiSelectionEnabled: false,
    focusedSelectionRequest: null,
    workspaceRecenterRequest: null,
    mapBoundsFitRequest: null,
    objectsPanelRequest: null,
    selectedFromObjectsPanel: false,

    setSelectedFeatureId: (
      featureId: string | null,
      options: SelectFeatureOptions = {},
    ) => {
      set((state) => {
        if (!featureId) {
          return {
            selectedFeatureId: null,
            selectedFeatureIds: [],
            selectedFromObjectsPanel: false,
            focusedSelectionRequest: state.focusedSelectionRequest,
          };
        }

        const nextState = {
          selectedFeatureId: featureId,
          selectedFeatureIds: [featureId],
          selectedFromObjectsPanel: Boolean(options.focusOnMap),
          focusedSelectionRequest: state.focusedSelectionRequest,
        };

        if (!options.focusOnMap) {
          return nextState;
        }

        return {
          ...nextState,
          focusedSelectionRequest: {
            featureId,
            requestId: (state.focusedSelectionRequest?.requestId ?? 0) + 1,
          },
        };
      });
    },

    setSelectedFeatureIds: (featureIds) => {
      set((state) => {
        const nextIds = uniqueFeatureIds(featureIds);
        const nextPrimary =
          state.selectedFeatureId && nextIds.includes(state.selectedFeatureId)
            ? state.selectedFeatureId
            : nextIds[nextIds.length - 1] ?? null;

        return {
          selectedFeatureIds: nextIds,
          selectedFeatureId: nextPrimary,
          selectedFromObjectsPanel: false,
        };
      });
    },

    toggleFeatureSelection: (
      featureId: string,
      options: SelectFeatureOptions = {},
    ) => {
      set((state) => {
        const isAlreadySelected = state.selectedFeatureIds.includes(featureId);
        const nextIds = isAlreadySelected
          ? state.selectedFeatureIds.filter((id) => id !== featureId)
          : [...state.selectedFeatureIds, featureId];
        const nextPrimary = isAlreadySelected
          ? state.selectedFeatureId === featureId
            ? nextIds[nextIds.length - 1] ?? null
            : state.selectedFeatureId
          : featureId;
        const shouldFocus = !isAlreadySelected && Boolean(options.focusOnMap);

        return {
          selectedFeatureIds: nextIds,
          selectedFeatureId: nextPrimary,
          selectedFromObjectsPanel: shouldFocus,
          focusedSelectionRequest: shouldFocus
            ? {
                featureId,
                requestId:
                  (state.focusedSelectionRequest?.requestId ?? 0) + 1,
              }
            : state.focusedSelectionRequest,
        };
      });
    },

    setMultiSelectionEnabled: (enabled) => {
      set({ multiSelectionEnabled: enabled });
    },

    clearSelectedFeatureId: () => {
      set((state) => {
        const shouldRecenterWorkspace = Boolean(
          state.selectedFeatureId && state.selectedFromObjectsPanel,
        );

        return {
          selectedFeatureId: null,
          selectedFeatureIds: [],
          selectedFromObjectsPanel: false,
          workspaceRecenterRequest: shouldRecenterWorkspace
            ? {
                requestId:
                  (state.workspaceRecenterRequest?.requestId ?? 0) + 1,
              }
            : state.workspaceRecenterRequest,
        };
      });
    },

    requestMapFitToBounds: (bounds, options = {}) => {
      set((state) => ({
        mapBoundsFitRequest: {
          bounds,
          requestId: (state.mapBoundsFitRequest?.requestId ?? 0) + 1,
          maxZoom: options.maxZoom,
          animate: options.animate,
        },
      }));
    },

    requestOpenFeatureInObjectsPanel: (featureId) => {
      set((state) => ({
        selectedFeatureId: featureId,
        selectedFeatureIds: state.selectedFeatureIds.includes(featureId)
          ? state.selectedFeatureIds
          : [featureId],
        selectedFromObjectsPanel: false,
        objectsPanelRequest: {
          featureId,
          requestId: (state.objectsPanelRequest?.requestId ?? 0) + 1,
        },
      }));
    },
  }),
);
