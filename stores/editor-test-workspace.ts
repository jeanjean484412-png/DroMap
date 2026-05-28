import { create } from "zustand";

import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";

type EditorTestWorkspaceState = {
  workspaceBounds: WorkspaceBounds | null;
  pendingFitToWorkspace: boolean;
  workspaceBasemapZoom: number | null;

  setWorkspaceBounds: (bounds: WorkspaceBounds) => void;
  clearWorkspaceBounds: () => void;
  validateWorkspaceZone: () => void;
  modifyWorkspaceZone: () => void;
  consumePendingWorkspaceFit: () => boolean;
  setWorkspaceBasemapZoom: (zoom: number | null) => void;
};

export const useEditorTestWorkspaceStore = create<EditorTestWorkspaceState>(
  (set, get) => ({
    workspaceBounds: null,
    pendingFitToWorkspace: false,
    workspaceBasemapZoom: null,

    setWorkspaceBounds: (bounds) => {
      set({
        workspaceBounds: bounds,
        workspaceBasemapZoom: null,
      });
    },

    clearWorkspaceBounds: () => {
      set({
        workspaceBounds: null,
        pendingFitToWorkspace: false,
        workspaceBasemapZoom: null,
      });

      useEditorTestModeStore.getState().setCurrentMode("workspace-select");
    },

    validateWorkspaceZone: () => {
      if (!get().workspaceBounds) {
        return;
      }

      set({
        pendingFitToWorkspace: true,
        workspaceBasemapZoom: null,
      });

      useEditorTestModeStore.getState().setCurrentMode("edit");
    },

    modifyWorkspaceZone: () => {
      set({
        pendingFitToWorkspace: false,
        workspaceBasemapZoom: null,
      });

      useEditorTestModeStore.getState().setCurrentMode("workspace-select");
    },

    consumePendingWorkspaceFit: () => {
      const pending = get().pendingFitToWorkspace;

      if (pending) {
        set({ pendingFitToWorkspace: false });
      }

      return pending;
    },

    setWorkspaceBasemapZoom: (zoom) => {
      if (zoom === null || !Number.isFinite(zoom)) {
        set({ workspaceBasemapZoom: null });
        return;
      }

      set({
        workspaceBasemapZoom: Math.max(0, Math.min(19, Math.round(zoom))),
      });
    },
  }),
);
