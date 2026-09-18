import { create } from "zustand";

export type EditorActiveTool =
  | "select"
  | "edit"
  | "marker"
  | "line"
  | "curved-line"
  | "freehand"
  | "trace-line"
  | "zone"
  | "freehand-zone"
  | "fill-zone"
  | "shape"
  | "text";

type EditorToolState = {
  activeTool: EditorActiveTool;
  setActiveTool: (tool: EditorActiveTool) => void;
  resetActiveTool: () => void;
};

export const useEditorToolStore = create<EditorToolState>((set) => ({
  activeTool: "select",
  setActiveTool: (tool) => set({ activeTool: tool }),
  resetActiveTool: () => set({ activeTool: "select" }),
}));
