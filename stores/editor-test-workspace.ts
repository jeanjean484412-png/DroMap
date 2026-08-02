import { create } from "zustand";

import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";
import {
  commitEditorHistoryBeforeWorkspaceChange,
  registerWorkspaceHistoryAccessors,
} from "@/stores/editor-test-history-coordinator";
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

function workspaceBoundsEqual(
  first: WorkspaceBounds | null,
  second: WorkspaceBounds | null,
) {
  if (first === second) {
    return true;
  }

  if (!first || !second) {
    return false;
  }

  return (
    first.southWest.lat === second.southWest.lat &&
    first.southWest.lng === second.southWest.lng &&
    first.northEast.lat === second.northEast.lat &&
    first.northEast.lng === second.northEast.lng
  );
}

export const useEditorTestWorkspaceStore = create<EditorTestWorkspaceState>(
  (set, get) => ({
    workspaceBounds: null,
    pendingFitToWorkspace: false,
    workspaceBasemapZoom: null,
    workspaceBasemapBaseZoom: null,

    setWorkspaceBounds: (bounds) => {
      if (workspaceBoundsEqual(get().workspaceBounds, bounds)) {
        return;
      }

      // La création ou le remplacement de la zone fait désormais partie du
      // même historique Ctrl+Z/Ctrl+Y que les objets de la carte.
      commitEditorHistoryBeforeWorkspaceChange();
      set({
        workspaceBounds: bounds,
        workspaceBasemapZoom: null,
        workspaceBasemapBaseZoom: null,
      });
    },

    clearWorkspaceBounds: () => {
      const state = get();
      if (
        state.workspaceBounds === null &&
        useEditorTestModeStore.getState().currentMode === "workspace-select"
      ) {
        return;
      }

      commitEditorHistoryBeforeWorkspaceChange();
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

      // setWorkspaceBounds a déjà enregistré l'état précédent. Ne pas ajouter
      // une seconde étape uniquement pour la validation, afin qu'un seul Ctrl+Z
      // annule bien toute la sélection de zone.
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

registerWorkspaceHistoryAccessors({
  capture: () => {
    const state = useEditorTestWorkspaceStore.getState();
    return {
      workspaceBounds: state.workspaceBounds
        ? structuredClone(state.workspaceBounds)
        : null,
      pendingFitToWorkspace: state.pendingFitToWorkspace,
      workspaceBasemapZoom: state.workspaceBasemapZoom,
      workspaceBasemapBaseZoom: state.workspaceBasemapBaseZoom,
      currentMode: useEditorTestModeStore.getState().currentMode,
    };
  },
  restore: (snapshot) => {
    useEditorTestWorkspaceStore.setState({
      workspaceBounds: snapshot.workspaceBounds
        ? structuredClone(snapshot.workspaceBounds)
        : null,
      pendingFitToWorkspace: snapshot.pendingFitToWorkspace,
      workspaceBasemapZoom: snapshot.workspaceBasemapZoom,
      workspaceBasemapBaseZoom: snapshot.workspaceBasemapBaseZoom,
    });
    useEditorTestModeStore.getState().setCurrentMode(snapshot.currentMode);
  },
});
