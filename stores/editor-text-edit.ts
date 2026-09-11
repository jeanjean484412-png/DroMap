import { create } from "zustand";

type EditorTextEditState = {
  editingTextFeatureId: string | null;
  startEditingTextFeature: (featureId: string) => void;
  stopEditingTextFeature: () => void;
};

export const useEditorTextEditStore = create<EditorTextEditState>(
  (set) => ({
    editingTextFeatureId: null,
    startEditingTextFeature: (editingTextFeatureId) =>
      set({ editingTextFeatureId }),
    stopEditingTextFeature: () => set({ editingTextFeatureId: null }),
  }),
);
