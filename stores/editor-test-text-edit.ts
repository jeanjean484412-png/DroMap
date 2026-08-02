import { create } from "zustand";

type EditorTestTextEditState = {
  editingTextFeatureId: string | null;
  startEditingTextFeature: (featureId: string) => void;
  stopEditingTextFeature: () => void;
};

export const useEditorTestTextEditStore = create<EditorTestTextEditState>(
  (set) => ({
    editingTextFeatureId: null,
    startEditingTextFeature: (editingTextFeatureId) =>
      set({ editingTextFeatureId }),
    stopEditingTextFeature: () => set({ editingTextFeatureId: null }),
  }),
);
