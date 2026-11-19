import { create } from "zustand";

export const EDIT_GEOJSON_FEATURE_EVENT = "dromap:edit-geojson-feature";

export type GeoJsonFeatureEditRequest = {
  layerId: string;
  featureId: string | number | undefined;
};

type DeleteFeatureLayerCommand = {
  featureId: string;
  commandId: number;
};

type EditorLayerCommandsState = {
  deleteFeatureLayerCommand: DeleteFeatureLayerCommand | null;
  requestDeleteFeatureLayer: (featureId: string) => void;
  clearDeleteFeatureLayerCommand: () => void;
};

export const useEditorLayerCommandsStore =
  create<EditorLayerCommandsState>((set) => ({
    deleteFeatureLayerCommand: null,

    requestDeleteFeatureLayer: (featureId) => {
      set({
        deleteFeatureLayerCommand: {
          featureId,
          commandId: Date.now(),
        },
      });
    },

    clearDeleteFeatureLayerCommand: () => {
      set({
        deleteFeatureLayerCommand: null,
      });
    },
  }));
