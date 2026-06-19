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
};

type EditorTestSelectionState = {
  selectedFeatureId: string | null;
  focusedSelectionRequest: SelectionRequest | null;
  workspaceRecenterRequest: WorkspaceRecenterRequest | null;
  mapBoundsFitRequest: MapBoundsFitRequest | null;
  selectedFromObjectsPanel: boolean;
  setSelectedFeatureId: (
    featureId: string | null,
    options?: SelectFeatureOptions,
  ) => void;
  clearSelectedFeatureId: () => void;
  requestMapFitToBounds: (bounds: WorkspaceBounds) => void;
};

export const useEditorTestSelectionStore = create<EditorTestSelectionState>(
  (set) => ({
    selectedFeatureId: null,
    focusedSelectionRequest: null,
    workspaceRecenterRequest: null,
    mapBoundsFitRequest: null,
    selectedFromObjectsPanel: false,

    setSelectedFeatureId: (featureId: string | null, options: SelectFeatureOptions = {}) => {
      set((state) => {
        if (featureId && options.focusOnMap) {
          return {
            selectedFeatureId: featureId,
            selectedFromObjectsPanel: true,
            focusedSelectionRequest: {
              featureId,
              requestId: (state.focusedSelectionRequest?.requestId ?? 0) + 1,
            },
          };
        }

        return {
          selectedFeatureId: featureId,
          selectedFromObjectsPanel: false,
          focusedSelectionRequest: state.focusedSelectionRequest,
        };
      });
    },

    clearSelectedFeatureId: () => {
      set((state) => {
        const shouldRecenterWorkspace = Boolean(
          state.selectedFeatureId && state.selectedFromObjectsPanel,
        );

        return {
          selectedFeatureId: null,
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

    requestMapFitToBounds: (bounds) => {
      set((state) => ({
        mapBoundsFitRequest: {
          bounds,
          requestId: (state.mapBoundsFitRequest?.requestId ?? 0) + 1,
        },
      }));
    },
  }),
);
