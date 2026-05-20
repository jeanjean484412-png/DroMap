import { create } from "zustand";

type EditorTestSelectionState = {
  selectedFeatureId: string | null;
  setSelectedFeatureId: (featureId: string | null) => void;
  clearSelectedFeatureId: () => void;
};

export const useEditorTestSelectionStore = create<EditorTestSelectionState>(
  (set) => ({
    selectedFeatureId: null,

    setSelectedFeatureId: (featureId) => {
      set({ selectedFeatureId: featureId });
    },

    clearSelectedFeatureId: () => {
      set({ selectedFeatureId: null });
    },
  })
);