import { create } from "zustand";

import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import { useEditorTestModeStore } from "@/stores/editor-test-mode";

const WORKSPACE_BASEMAP_DETAIL_DELTA = 1;

type EditorTestWorkspaceState = {
  workspaceBounds: WorkspaceBounds | null;
  pendingFitToWorkspace: boolean;
  /** Niveau de détail actuellement utilisé par le fond figé. */
  workspaceBasemapZoom: number | null;
  /** Niveau de détail vu par l'utilisateur au moment de la validation de zone. */
  workspaceBasemapBaseZoom: number | null;

  setWorkspaceBounds: (bounds: WorkspaceBounds) => void;
  clearWorkspaceBounds: () => void;
  validateWorkspaceZone: () => void;
  modifyWorkspaceZone: () => void;
  consumePendingWorkspaceFit: () => boolean;
  setWorkspaceBasemapZoom: (zoom: number | null) => void;
  setWorkspaceBasemapBaseZoom: (zoom: number | null) => void;
};

function normalizeBasemapZoom(zoom: number | null) {
  if (zoom === null || !Number.isFinite(zoom)) {
    return null;
  }

  const clampedZoom = Math.max(0, Math.min(20, zoom));

  // Le zoom de détail doit pouvoir rester fractionnaire : pendant la sélection
  // de zone, Leaflet/MapLibre peuvent être à 6.25, 6.5, etc. Arrondir à
  // l’entier changerait déjà les labels/détails du fond.
  return Math.round(clampedZoom * 4) / 4;
}

export const useEditorTestWorkspaceStore = create<EditorTestWorkspaceState>(
  (set, get) => ({
    workspaceBounds: null,
    pendingFitToWorkspace: false,
    workspaceBasemapZoom: null,
    workspaceBasemapBaseZoom: null,

    setWorkspaceBounds: (bounds) => {
      set({
        workspaceBounds: bounds,
        workspaceBasemapZoom: null,
        workspaceBasemapBaseZoom: null,
      });
    },

    clearWorkspaceBounds: () => {
      set({
        workspaceBounds: null,
        pendingFitToWorkspace: false,
        workspaceBasemapZoom: null,
        workspaceBasemapBaseZoom: null,
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
        workspaceBasemapBaseZoom: null,
      });

      useEditorTestModeStore.getState().setCurrentMode("edit");
    },

    modifyWorkspaceZone: () => {
      set({
        pendingFitToWorkspace: false,
        workspaceBasemapZoom: null,
        workspaceBasemapBaseZoom: null,
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
      const normalizedZoom = normalizeBasemapZoom(zoom);

      set((state) => {
        const baseZoom = state.workspaceBasemapBaseZoom;

        if (
          normalizedZoom === null ||
          baseZoom === null ||
          !Number.isFinite(baseZoom)
        ) {
          return { workspaceBasemapZoom: normalizedZoom };
        }

        return {
          workspaceBasemapZoom: Math.min(
            Math.max(normalizedZoom, baseZoom - WORKSPACE_BASEMAP_DETAIL_DELTA),
            baseZoom + WORKSPACE_BASEMAP_DETAIL_DELTA,
          ),
        };
      });
    },

    setWorkspaceBasemapBaseZoom: (zoom) => {
      const normalizedZoom = normalizeBasemapZoom(zoom);

      set({
        workspaceBasemapBaseZoom: normalizedZoom,
        workspaceBasemapZoom: normalizedZoom,
      });
    },
  }),
);
