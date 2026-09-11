import { create } from "zustand";

import type { EditorMode } from "@/lib/dromap/editor-mode";

type EditorModeState = {
  currentMode: EditorMode;
  setCurrentMode: (mode: EditorMode) => void;
};

export const useEditorModeStore = create<EditorModeState>((set) => ({
  currentMode: "workspace-select",

  setCurrentMode: (mode) => {
    set({ currentMode: mode });
  },
}));