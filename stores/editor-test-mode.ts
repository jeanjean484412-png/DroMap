import { create } from "zustand";

import type { EditorMode } from "@/lib/dromap/editor-mode";

type EditorTestModeState = {
  currentMode: EditorMode;
  setCurrentMode: (mode: EditorMode) => void;
};

export const useEditorTestModeStore = create<EditorTestModeState>((set) => ({
  currentMode: "navigation",
  setCurrentMode: (mode) => set({ currentMode: mode }),
}));
