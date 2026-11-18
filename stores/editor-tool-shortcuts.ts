import { create } from "zustand";

import type { DroMapMarkerSymbol, DroMapZoneShapeKind } from "@/lib/dromap/feature";
import type { EditorActiveTool } from "@/stores/editor-tool";
import type { useEditorDrawingOptionsStore } from "@/stores/editor-drawing-options";

type DrawingOptions = ReturnType<typeof useEditorDrawingOptionsStore.getState>;
type ShortcutTool = Exclude<EditorActiveTool, "select" | "edit" | "text">;

export type EditorToolShortcut = {
  key: string;
  tool: ShortcutTool;
  label: string;
  lastUsed: number;
  symbol?: DroMapMarkerSymbol;
  shapeKind?: DroMapZoneShapeKind;
  markerStyle?: DrawingOptions["markerStyle"];
  lineStyle?: DrawingOptions["lineStyle"];
  zoneStyle?: DrawingOptions["zoneStyle"];
};

type EditorToolShortcutsState = {
  shortcuts: EditorToolShortcut[];
  setShortcuts: (update: (shortcuts: EditorToolShortcut[]) => EditorToolShortcut[]) => void;
  restoreShortcuts: (shortcuts: unknown) => void;
};

const shortcutTools = new Set<ShortcutTool>([
  "marker", "line", "curved-line", "freehand", "trace-line",
  "zone", "freehand-zone", "fill-zone", "shape",
]);

function parseShortcuts(value: unknown): EditorToolShortcut[] {
  if (!Array.isArray(value)) return [];
  const keys = new Set<string>();
  return value.filter((item): item is EditorToolShortcut => {
    if (!item || typeof item !== "object") return false;
    const shortcut = item as Partial<EditorToolShortcut>;
    if (
      typeof shortcut.key !== "string" ||
      typeof shortcut.label !== "string" ||
      shortcut.tool === undefined || !shortcutTools.has(shortcut.tool) ||
      typeof shortcut.lastUsed !== "number" ||
      !Number.isFinite(shortcut.lastUsed) ||
      keys.has(shortcut.key)
    ) return false;
    keys.add(shortcut.key);
    return true;
  }).slice(0, 4);
}

export const useEditorToolShortcutsStore = create<EditorToolShortcutsState>((set) => ({
  shortcuts: [],
  setShortcuts: (update) => set((state) => {
    const shortcuts = update(state.shortcuts);
    return shortcuts === state.shortcuts ? state : { shortcuts };
  }),
  restoreShortcuts: (shortcuts) => set({ shortcuts: parseShortcuts(shortcuts) }),
}));
