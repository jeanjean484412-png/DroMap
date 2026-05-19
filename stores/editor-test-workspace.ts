import { create } from "zustand";

import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";

type EditorTestWorkspaceState = {
  workspaceBounds: WorkspaceBounds | null;
  pendingFitToWorkspace: boolean;
  setWorkspaceBounds: (bounds: WorkspaceBounds) => void;
  clearWorkspaceBounds: () => void;
  validateWorkspaceZone: () => void;
  modifyWorkspaceZone: () => void;
  consumePendingWorkspaceFit: () => boolean;
};

export const useEditorTestWorkspaceStore = create<EditorTestWorkspaceState>(
  (set, get) => ({
    workspaceBounds: null,
    pendingFitToWorkspace: false,

    setWorkspaceBounds: (bounds) => set({ workspaceBounds: bounds }),

    clearWorkspaceBounds: () =>
      set({ workspaceBounds: null, pendingFitToWorkspace: false }),

    validateWorkspaceZone: () => {
      if (!get().workspaceBounds) return;
      set({ pendingFitToWorkspace: true });
      useEditorTestModeStore.getState().setCurrentMode("edit");
    },

    modifyWorkspaceZone: () => {
      set({ pendingFitToWorkspace: false });
      useEditorTestModeStore.getState().setCurrentMode("workspace-select");
    },

    consumePendingWorkspaceFit: () => {
      const pending = get().pendingFitToWorkspace;
      if (pending) set({ pendingFitToWorkspace: false });
      return pending;
    },
  }),
);
