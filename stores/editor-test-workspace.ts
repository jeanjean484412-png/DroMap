import { create } from "zustand";

import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";

type EditorTestWorkspaceState = {
  workspaceBounds: WorkspaceBounds | null;
  setWorkspaceBounds: (bounds: WorkspaceBounds) => void;
  clearWorkspaceBounds: () => void;
};

export const useEditorTestWorkspaceStore = create<EditorTestWorkspaceState>(
  (set) => ({
    workspaceBounds: null,

    setWorkspaceBounds: (bounds) => set({ workspaceBounds: bounds }),

    clearWorkspaceBounds: () => set({ workspaceBounds: null }),
  }),
);
