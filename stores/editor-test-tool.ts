import { create } from "zustand";

export type EditorTestActiveTool =
  | "select"
  | "edit"
  | "marker"
  | "line"
  | "freehand"
  | "zone"
  | "text";

type EditorTestToolState = {
  activeTool: EditorTestActiveTool;
  setActiveTool: (tool: EditorTestActiveTool) => void;
  resetActiveTool: () => void;
};

export const useEditorTestToolStore = create<EditorTestToolState>((set) => ({
  activeTool: "select",
  setActiveTool: (tool) => set({ activeTool: tool }),
  resetActiveTool: () => set({ activeTool: "select" }),
}));
